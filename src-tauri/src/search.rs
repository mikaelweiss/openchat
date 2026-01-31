use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Mutex, LazyLock};
use tauri_plugin_keyring::{KeyringExt};
use tauri::Manager;
use base64::Engine;
use scraper::{Html, Selector};


// Cache for search results to avoid repeated API calls
static SEARCH_CACHE: LazyLock<Mutex<HashMap<String, (SearchOutput, std::time::SystemTime)>>> = LazyLock::new(|| Mutex::new(HashMap::new()));
const CACHE_DURATION_SECS: u64 = 300; // 5 minutes

#[derive(Debug, Deserialize)]
pub struct SearchInput {
    pub query: String,
    pub engine: Option<String>,
    #[serde(rename = "topK")]
    pub top_k: Option<u8>,
}

#[derive(Debug, Serialize, Clone)]
pub struct SearchResultItem {
    pub title: String,
    pub url: String,
    pub snippet: String,
    pub engine: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct SearchOutput {
    pub results: Vec<SearchResultItem>,
}

#[tauri::command]
pub async fn tool_web_search(
    input: SearchInput,
    app: tauri::AppHandle,
) -> Result<SearchOutput, String> {
    println!("tool_web_search called with input: {:?}", input);
    let engine = input.engine.unwrap_or_else(|| "duckduckgo".to_string());
    let top_k = input.top_k.unwrap_or(5) as usize;
    println!("Using engine: {}, top_k: {}", engine, top_k);
    let cache_key = format!("{}::{}::{}", engine, top_k, input.query.to_lowercase().trim());

    // Check cache first
    if let Ok(cache) = SEARCH_CACHE.lock() {
        if let Some((cached_result, timestamp)) = cache.get(&cache_key) {
            if timestamp.elapsed().unwrap_or_default().as_secs() < CACHE_DURATION_SECS {
                return Ok(cached_result.clone());
            }
        }
    }

    // Perform search based on engine
    let results = match engine.as_str() {
        "tavily" => search_tavily(&input.query, top_k, &app).await?,
        "google" => search_google(&input.query, top_k, &app).await?,
        "bing" => search_bing(&input.query, top_k, &app).await?,
        "brave" => search_brave(&input.query, top_k, &app).await?,
        "duckduckgo" | _ => search_duckduckgo(&input.query, top_k).await?,
    };

    let output = SearchOutput { results };

    // Cache the result
    if let Ok(mut cache) = SEARCH_CACHE.lock() {
        // Clean old entries while we're here
        let now = std::time::SystemTime::now();
        cache.retain(|_, (_, timestamp)| {
            timestamp.elapsed().unwrap_or_default().as_secs() < CACHE_DURATION_SECS
        });
        
        cache.insert(cache_key, (output.clone(), now));
    }

    Ok(output)
}

async fn get_api_key(engine: &str, app: &tauri::AppHandle) -> Result<String, String> {
    let provider_id = format!("search-{}", engine);
    let key_name = format!("provider-{}", provider_id);
    
    println!("Attempting to retrieve API key for engine: {}", engine);
    println!("Provider ID: {}, Key name: {}", provider_id, key_name);

    // Check if we're in development mode by checking for the existence of the encrypted file
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;
    let keys_file_path = app_data_dir.join("keys.enc");
    
    if keys_file_path.exists() {
        println!("Development mode detected - reading from encrypted file");
        
        // Development mode: read from encrypted file
        match std::fs::read_to_string(&keys_file_path) {
            Ok(encrypted_content) => {
                println!("Successfully read encrypted file, decrypting...");
                match decrypt_dev_keys(&encrypted_content) {
                    Ok(keys_data) => {
                        if let Some(api_key) = keys_data.get(&key_name) {
                            println!("API key found for {}, length: {}", engine, api_key.len());
                            if api_key.trim().is_empty() {
                                Err(format!("API key is empty for {}", engine))
                            } else {
                                Ok(api_key.clone())
                            }
                        } else {
                            println!("API key not found in encrypted file for {}", engine);
                            println!("Available keys: {:?}", keys_data.keys().collect::<Vec<_>>());
                            Err(format!("API key not configured for {}", engine))
                        }
                    }
                    Err(e) => {
                        println!("Failed to decrypt keys file: {}", e);
                        Err(format!("Failed to decrypt API keys: {}", e))
                    }
                }
            }
            Err(e) => {
                println!("Failed to read encrypted keys file: {}", e);
                Err(format!("Failed to read API keys file: {}", e))
            }
        }
    } else {
        println!("Production mode detected - using system keychain");
        
        // Production mode: use system keychain
        let service = "open-chat";
        let account = &key_name;

        match app.keyring().get_password(service, account) {
            Ok(Some(key)) => {
                println!("API key found for {}, length: {}", engine, key.len());
                if key.trim().is_empty() {
                    println!("API key is empty for {}", engine);
                    Err(format!("API key is empty for {}", engine))
                } else {
                    println!("API key retrieved successfully for {}", engine);
                    Ok(key)
                }
            }
            Ok(None) => {
                println!("API key is None for {}", engine);
                Err(format!("API key not configured for {}", engine))
            }
            Err(e) => {
                println!("Error retrieving API key for {}: {}", engine, e);
                Err(format!("API key not found for {}: {}", engine, e))
            }
        }
    }
}

// Simple XOR decryption to match frontend logic
fn decrypt_dev_keys(encrypted: &str) -> Result<HashMap<String, String>, String> {
    let encryption_key = "open-chat-2024-secure-key-storage-v1-dev-only";
    
    // Base64 decode
    let decoded = base64::engine::general_purpose::STANDARD.decode(encrypted)
        .map_err(|e| format!("Failed to base64 decode: {}", e))?;
    
    // XOR decrypt
    let mut result = String::new();
    for (i, byte) in decoded.iter().enumerate() {
        let key_byte = encryption_key.as_bytes()[i % encryption_key.len()];
        result.push((byte ^ key_byte) as char);
    }
    
    // Parse JSON
    serde_json::from_str(&result)
        .map_err(|e| format!("Failed to parse JSON: {}", e))
}

async fn get_google_cx(app: &tauri::AppHandle) -> Result<String, String> {
    let key_name = "provider-search-google-cx";
    
    println!("Attempting to retrieve Google cx parameter");

    // Check if we're in development mode by checking for the existence of the encrypted file
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;
    let keys_file_path = app_data_dir.join("keys.enc");
    
    if keys_file_path.exists() {
        println!("Development mode detected - reading cx from encrypted file");
        
        // Development mode: read from encrypted file
        match std::fs::read_to_string(&keys_file_path) {
            Ok(encrypted_content) => {
                match decrypt_dev_keys(&encrypted_content) {
                    Ok(keys_data) => {
                        if let Some(cx) = keys_data.get(key_name) {
                            println!("Google cx found, length: {}", cx.len());
                            Ok(cx.clone())
                        } else {
                            println!("Google cx not found in encrypted file");
                            Err("Google Custom Search Engine ID (cx) not configured".to_string())
                        }
                    }
                    Err(e) => {
                        println!("Failed to decrypt keys file: {}", e);
                        Err(format!("Failed to decrypt API keys: {}", e))
                    }
                }
            }
            Err(e) => {
                println!("Failed to read encrypted keys file: {}", e);
                Err(format!("Failed to read API keys file: {}", e))
            }
        }
    } else {
        println!("Production mode detected - using system keychain for cx");
        
        // Production mode: use system keychain
        let service = "open-chat";
        let account = key_name;

        match app.keyring().get_password(service, account) {
            Ok(Some(cx)) => {
                println!("Google cx retrieved successfully");
                Ok(cx)
            }
            Ok(None) => {
                println!("Google cx is None");
                Err("Google Custom Search Engine ID (cx) not configured".to_string())
            }
            Err(e) => {
                println!("Error retrieving Google cx: {}", e);
                Err("Google Custom Search Engine ID (cx) not configured".to_string())
            }
        }
    }
}

async fn search_tavily(
    query: &str,
    top_k: usize,
    app: &tauri::AppHandle,
) -> Result<Vec<SearchResultItem>, String> {
    println!("search_tavily called for query: {}", query);
    let api_key = get_api_key("tavily", app).await?;
    println!("Successfully retrieved API key for Tavily, starting search...");
    let client = reqwest::Client::new();
    
    let request_body = serde_json::json!({
        "query": query,
        "max_results": top_k
    });

    let response = client
        .post("https://api.tavily.com/search")
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&request_body)
        .send()
        .await
        .map_err(|e| format!("Tavily API request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Tavily API error: {}", response.status()));
    }

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Tavily response: {}", e))?;

    let mut results = Vec::new();
    if let Some(array) = json.get("results").and_then(|v| v.as_array()) {
        for item in array.iter().take(top_k) {
            results.push(SearchResultItem {
                title: item
                    .get("title")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                url: item
                    .get("url")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                snippet: item
                    .get("content")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                engine: "tavily".to_string(),
            });
        }
    }

    Ok(results)
}

async fn search_google(
    query: &str,
    top_k: usize,
    app: &tauri::AppHandle,
) -> Result<Vec<SearchResultItem>, String> {
    let api_key = get_api_key("google", app).await?;
    
    // Google also needs cx (Custom Search Engine ID)
    let cx = get_google_cx(&app).await?;

    let client = reqwest::Client::new();
    let url = format!(
        "https://www.googleapis.com/customsearch/v1?key={}&cx={}&num={}&q={}",
        api_key,
        cx,
        top_k,
        urlencoding::encode(query)
    );

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Google API request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Google API error: {}", response.status()));
    }

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Google response: {}", e))?;

    let mut results = Vec::new();
    if let Some(items) = json.get("items").and_then(|v| v.as_array()) {
        for item in items.iter().take(top_k) {
            results.push(SearchResultItem {
                title: item
                    .get("title")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                url: item
                    .get("link")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                snippet: item
                    .get("snippet")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                engine: "google".to_string(),
            });
        }
    }

    Ok(results)
}

async fn search_bing(
    query: &str,
    top_k: usize,
    app: &tauri::AppHandle,
) -> Result<Vec<SearchResultItem>, String> {
    let api_key = get_api_key("bing", app).await?;
    let client = reqwest::Client::new();

    let response = client
        .get("https://api.bing.microsoft.com/v7.0/search")
        .header("Ocp-Apim-Subscription-Key", api_key)
        .query(&[("q", query), ("count", &top_k.to_string())])
        .send()
        .await
        .map_err(|e| format!("Bing API request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Bing API error: {}", response.status()));
    }

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Bing response: {}", e))?;

    let mut results = Vec::new();
    if let Some(items) = json
        .get("webPages")
        .and_then(|v| v.get("value"))
        .and_then(|v| v.as_array())
    {
        for item in items.iter().take(top_k) {
            results.push(SearchResultItem {
                title: item
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                url: item
                    .get("url")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                snippet: item
                    .get("snippet")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                engine: "bing".to_string(),
            });
        }
    }

    Ok(results)
}

async fn search_brave(
    query: &str,
    top_k: usize,
    app: &tauri::AppHandle,
) -> Result<Vec<SearchResultItem>, String> {
    let api_key = get_api_key("brave", app).await?;
    let client = reqwest::Client::new();

    let response = client
        .get("https://api.search.brave.com/res/v1/web/search")
        .header("X-Subscription-Token", api_key)
        .query(&[("q", query), ("count", &top_k.to_string())])
        .send()
        .await
        .map_err(|e| format!("Brave API request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Brave API error: {}", response.status()));
    }

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Brave response: {}", e))?;

    let mut results = Vec::new();
    if let Some(items) = json
        .get("web")
        .and_then(|v| v.get("results"))
        .and_then(|v| v.as_array())
    {
        for item in items.iter().take(top_k) {
            results.push(SearchResultItem {
                title: item
                    .get("title")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                url: item
                    .get("url")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                snippet: item
                    .get("description")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                engine: "brave".to_string(),
            });
        }
    }

    Ok(results)
}

async fn search_duckduckgo(query: &str, top_k: usize) -> Result<Vec<SearchResultItem>, String> {
    let client = reqwest::Client::new();
    let url = format!("https://html.duckduckgo.com/html/?q={}", urlencoding::encode(query));

    let response = client
        .get(&url)
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36")
        .send()
        .await
        .map_err(|e| format!("DuckDuckGo request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("DuckDuckGo API error: {}", response.status()));
    }

    let html_content = response.text().await.map_err(|e| format!("Failed to read DuckDuckGo response: {}", e))?;
    let document = Html::parse_document(&html_content);

    let result_selector = Selector::parse("div.result").unwrap();
    let title_selector = Selector::parse("h2.result__title > a.result__a").unwrap();
    let snippet_selector = Selector::parse("a.result__snippet").unwrap();

    let mut results = Vec::new();
    for result_node in document.select(&result_selector).take(top_k) {
        let title = result_node.select(&title_selector).next().and_then(|n| n.text().next()).unwrap_or("").trim().to_string();
        let url = result_node.select(&title_selector).next().and_then(|n| n.value().attr("href")).unwrap_or("").to_string();
        let snippet = result_node.select(&snippet_selector).next().and_then(|n| n.text().next()).unwrap_or("").trim().to_string();

        if !title.is_empty() && !url.is_empty() {
            results.push(SearchResultItem {
                title,
                url,
                snippet,
                engine: "duckduckgo".to_string(),
            });
        }
    }

    if results.is_empty() {
        results.push(SearchResultItem {
            title: "No results found on DuckDuckGo".to_string(),
            url: format!("https://duckduckgo.com/?q={}", urlencoding::encode(query)),
            snippet: "Try a different search engine for better results.".to_string(),
            engine: "duckduckgo".to_string(),
        });
    }

    Ok(results)
}