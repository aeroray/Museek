//! Race-mirror download for updater artifacts, then verify + quiet-install via
//! the official updater (signature checked against pubkey).

use serde::Serialize;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Instant;
use tauri::{AppHandle, Emitter, Runtime};
use tauri_plugin_updater::UpdaterExt;
use url::Url;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProgressPayload {
    downloaded: u64,
    total: Option<u64>,
    percent: Option<u32>,
    phase: &'static str,
}

fn emit_progress<R: Runtime>(app: &AppHandle<R>, payload: ProgressPayload) {
    let _ = app.emit("update-download-progress", payload);
}

/// Concurrent Range probe — order by TTFB (fastest first). Failures go last.
/// If every probe fails, still try full downloads in the original order.
async fn order_by_probe(urls: &[String]) -> Vec<String> {
    if urls.len() <= 1 {
        return urls.to_vec();
    }

    let client = match reqwest::Client::builder()
        .user_agent("Museek")
        .timeout(std::time::Duration::from_secs(5))
        .build()
    {
        Ok(c) => c,
        Err(_) => return urls.to_vec(),
    };

    let mut joins = Vec::with_capacity(urls.len());
    for url in urls.iter().cloned() {
        let client = client.clone();
        joins.push(tauri::async_runtime::spawn(async move {
            let start = Instant::now();
            let res = client
                .get(&url)
                .header("Range", "bytes=0-0")
                .send()
                .await
                .ok()?;
            if !(res.status().is_success() || res.status().as_u16() == 206) {
                return None;
            }
            let _ = res.bytes().await.ok()?;
            Some((start.elapsed(), url))
        }));
    }

    let mut ranked: Vec<(std::time::Duration, String)> = Vec::new();
    for join in joins {
        if let Ok(Some(hit)) = join.await {
            ranked.push(hit);
        }
    }
    ranked.sort_by_key(|(d, _)| *d);

    let mut ordered: Vec<String> = ranked.into_iter().map(|(_, u)| u).collect();
    for url in urls {
        if !ordered.contains(url) {
            ordered.push(url.clone());
        }
    }
    ordered
}

async fn try_download_one<R: Runtime>(
    app: &AppHandle<R>,
    update: &mut tauri_plugin_updater::Update,
    url: &str,
) -> Result<(), String> {
    let parsed = Url::parse(url).map_err(|e| e.to_string())?;
    update.download_url = parsed;

    let downloaded = Arc::new(AtomicU64::new(0));
    let app_chunk = app.clone();
    let downloaded_chunk = Arc::clone(&downloaded);
    let app_done = app.clone();

    let bytes = update
        .download(
            move |chunk_len, content_length| {
                let total = downloaded_chunk.fetch_add(chunk_len as u64, Ordering::Relaxed)
                    + chunk_len as u64;
                let percent = content_length
                    .filter(|t| *t > 0)
                    .map(|t| ((total.min(t) as f64 / t as f64) * 100.0).round() as u32)
                    .map(|p| p.min(100));
                emit_progress(
                    &app_chunk,
                    ProgressPayload {
                        downloaded: total,
                        total: content_length,
                        percent,
                        phase: "downloading",
                    },
                );
            },
            move || {
                let total = downloaded.load(Ordering::Relaxed);
                emit_progress(
                    &app_done,
                    ProgressPayload {
                        downloaded: total,
                        total: Some(total),
                        percent: Some(100),
                        phase: "installing",
                    },
                );
            },
        )
        .await
        .map_err(|e| e.to_string())?;

    // Signal JS so a dropped IPC after process::exit is not treated as failure.
    let _ = app.emit("update-about-to-install", ());
    update.install(bytes).map_err(|e| e.to_string())
}

/// Check for update, prefer the check-winner URL first, then TTFB-race the rest,
/// verify signature, quiet-install. On Windows, `install` exits after launching NSIS.
pub async fn run<R: Runtime>(app: AppHandle<R>, urls: Vec<String>) -> Result<(), String> {
    let updater = app.updater().map_err(|e| e.to_string())?;
    let mut update = updater
        .check()
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "当前没有可安装的更新。请稍后重试「检查更新」。".to_string())?;

    let mut candidates = if urls.is_empty() {
        vec![update.download_url.to_string()]
    } else {
        urls
    };
    let announced = update.download_url.to_string();
    if !candidates.iter().any(|u| u == &announced) {
        candidates.push(announced);
    }

    emit_progress(
        &app,
        ProgressPayload {
            downloaded: 0,
            total: None,
            percent: None,
            phase: "downloading",
        },
    );

    let mut last_err: Option<String> = None;

    // 1) Prefer the check-winner (first URL) for a full download attempt.
    let (preferred, rest) = match candidates.split_first() {
        Some((first, rest)) => (Some(first.clone()), rest.to_vec()),
        None => (None, Vec::new()),
    };

    if let Some(first) = preferred {
        match try_download_one(&app, &mut update, &first).await {
            Ok(()) => return Ok(()),
            Err(e) => last_err = Some(e),
        }
    }

    // 2) Remaining mirrors: TTFB probe, then sequential failover.
    if !rest.is_empty() {
        let ordered = order_by_probe(&rest).await;
        for url in ordered {
            match try_download_one(&app, &mut update, &url).await {
                Ok(()) => return Ok(()),
                Err(e) => last_err = Some(e),
            }
        }
    }

    Err(last_err.unwrap_or_else(|| {
        "所有镜像均无法下载安装包。请稍后重试「检查更新」。".to_string()
    }))
}
