use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemResources {
    pub total_memory_gb: f64,
    pub available_memory_gb: f64,
    pub available_storage_gb: f64,
    pub cpu_cores: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelCompatibility {
    pub is_compatible: bool,
    pub confidence_level: f64, // 0.0 to 1.0
    pub required_memory_gb: f64,
    pub available_memory_gb: f64,
    pub memory_sufficient: bool,
    pub storage_sufficient: bool,
    pub warnings: Vec<String>,
}

pub async fn get_system_resources() -> Result<SystemResources, String> {
    let timeout_duration = std::time::Duration::from_secs(5);
    
    // Get total system memory in bytes
    let total_memory_bytes = tokio::time::timeout(timeout_duration, get_total_memory())
        .await
        .map_err(|_| "Total memory query timed out".to_string())??;
    let total_memory_gb = bytes_to_gb(total_memory_bytes);
    
    // Get available memory (conservative estimate)
    let available_memory_bytes = tokio::time::timeout(timeout_duration, get_available_memory())
        .await
        .map_err(|_| "Available memory query timed out".to_string())??;
    let available_memory_gb = bytes_to_gb(available_memory_bytes);
    
    // Get available storage space
    let available_storage_bytes = tokio::time::timeout(timeout_duration, get_available_storage())
        .await
        .map_err(|_| "Storage query timed out".to_string())??;
    let available_storage_gb = bytes_to_gb(available_storage_bytes);
    
    // Get CPU core count
    let cpu_cores = get_cpu_cores();

    Ok(SystemResources {
        total_memory_gb,
        available_memory_gb,
        available_storage_gb,
        cpu_cores,
    })
}

pub async fn validate_model_compatibility(
    model_size_bytes: u64,
    model_name: &str,
) -> Result<ModelCompatibility, String> {
    let system_resources = get_system_resources().await?;
    let model_size_gb = bytes_to_gb(model_size_bytes);
    
    // Estimate required RAM based on model size and type
    let required_memory_gb = estimate_model_memory_requirements(model_size_bytes, model_name);
    
    // Check if we have enough memory (leave some buffer for OS and other apps)
    let memory_buffer_gb = 2.0; // Reserve 2GB for system
    let usable_memory_gb = system_resources.available_memory_gb - memory_buffer_gb;
    let memory_sufficient = usable_memory_gb >= required_memory_gb;
    
    // Check if we have enough storage (need space for model + some overhead)
    let storage_overhead_gb = 1.0; // 1GB overhead for temporary files, etc.
    let storage_sufficient = system_resources.available_storage_gb >= (model_size_gb + storage_overhead_gb);
    
    // Calculate confidence level based on available resources
    let memory_ratio = if required_memory_gb > 0.0 {
        usable_memory_gb / required_memory_gb
    } else {
        1.0
    };
    
    let storage_ratio = if model_size_gb > 0.0 {
        system_resources.available_storage_gb / (model_size_gb + storage_overhead_gb)
    } else {
        1.0
    };
    
    let confidence_level = calculate_confidence_level(memory_ratio, storage_ratio);
    
    // Generate warnings
    let mut warnings = Vec::new();
    
    if !memory_sufficient {
        warnings.push(format!(
            "Insufficient RAM: Model requires {:.1}GB, but only {:.1}GB available after system overhead",
            required_memory_gb, usable_memory_gb
        ));
    } else if memory_ratio < 1.5 {
        warnings.push(format!(
            "Tight memory: Model requires {:.1}GB, only {:.1}GB available. Performance may be affected.",
            required_memory_gb, usable_memory_gb
        ));
    }
    
    if !storage_sufficient {
        warnings.push(format!(
            "Insufficient storage: Need {:.1}GB for model + overhead, but only {:.1}GB available",
            model_size_gb + storage_overhead_gb, system_resources.available_storage_gb
        ));
    }
    
    if system_resources.cpu_cores < 4 {
        warnings.push("CPU has fewer than 4 cores. Model inference may be slow.".to_string());
    }

    let is_compatible = memory_sufficient && storage_sufficient;

    Ok(ModelCompatibility {
        is_compatible,
        confidence_level,
        required_memory_gb,
        available_memory_gb: usable_memory_gb,
        memory_sufficient,
        storage_sufficient,
        warnings,
    })
}

fn estimate_model_memory_requirements(model_size_bytes: u64, model_name: &str) -> f64 {
    let model_size_gb = bytes_to_gb(model_size_bytes);
    let model_name_lower = model_name.to_lowercase();
    
    // Base multiplier for loading the model into memory
    let mut memory_multiplier = 1.2; // Base overhead for model loading
    
    // Adjust based on model characteristics
    if model_name_lower.contains("7b") || model_name_lower.contains("7-b") {
        memory_multiplier = 1.5; // ~8GB for 7B models
    } else if model_name_lower.contains("13b") || model_name_lower.contains("13-b") {
        memory_multiplier = 1.6; // ~16GB for 13B models
    } else if model_name_lower.contains("70b") || model_name_lower.contains("70-b") {
        memory_multiplier = 1.8; // ~80GB for 70B models
    } else if model_name_lower.contains("vision") || model_name_lower.contains("llava") {
        memory_multiplier = 1.7; // Vision models need more memory
    } else if model_name_lower.contains("code") || model_name_lower.contains("coder") {
        memory_multiplier = 1.4; // Code models are usually more efficient
    }
    
    // For very small models, set a minimum requirement
    let estimated_memory = model_size_gb * memory_multiplier;
    if estimated_memory < 2.0 {
        2.0 // Minimum 2GB for any model
    } else {
        estimated_memory
    }
}

fn calculate_confidence_level(memory_ratio: f64, storage_ratio: f64) -> f64 {
    let memory_score = if memory_ratio >= 2.0 {
        1.0
    } else if memory_ratio >= 1.5 {
        0.8
    } else if memory_ratio >= 1.0 {
        0.6
    } else {
        0.0
    };
    
    let storage_score = if storage_ratio >= 2.0 {
        1.0
    } else if storage_ratio >= 1.5 {
        0.9
    } else if storage_ratio >= 1.0 {
        0.7
    } else {
        0.0
    };
    
    // Weighted average (memory is more important than storage)
    let result: f64 = memory_score * 0.7 + storage_score * 0.3;
    result.min(1.0).max(0.0)
}

fn bytes_to_gb(bytes: u64) -> f64 {
    bytes as f64 / (1024.0 * 1024.0 * 1024.0)
}

fn get_cpu_cores() -> usize {
    std::thread::available_parallelism()
        .map(|p| p.get())
        .unwrap_or(1)
}

#[cfg(target_os = "windows")]
async fn get_total_memory() -> Result<u64, String> {
    use std::process::Command;
    
    let output = Command::new("wmic")
        .args(&["computersystem", "get", "TotalPhysicalMemory", "/value"])
        .output()
        .map_err(|e| format!("Failed to get memory info: {}", e))?;
    
    let output_str = String::from_utf8_lossy(&output.stdout);
    for line in output_str.lines() {
        if line.starts_with("TotalPhysicalMemory=") {
            if let Some(memory_str) = line.split('=').nth(1) {
                if let Ok(memory) = memory_str.trim().parse::<u64>() {
                    return Ok(memory);
                }
            }
        }
    }
    
    Err("Could not parse memory information".to_string())
}

#[cfg(target_os = "macos")]
async fn get_total_memory() -> Result<u64, String> {
    use std::process::Command;
    
    let output = Command::new("sysctl")
        .args(&["-n", "hw.memsize"])
        .output()
        .map_err(|e| format!("Failed to get memory info: {}", e))?;
    
    let memory_str = String::from_utf8_lossy(&output.stdout);
    memory_str.trim().parse::<u64>()
        .map_err(|e| format!("Failed to parse memory size: {}", e))
}

#[cfg(target_os = "linux")]
async fn get_total_memory() -> Result<u64, String> {
    use std::fs;
    
    let meminfo = fs::read_to_string("/proc/meminfo")
        .map_err(|e| format!("Failed to read /proc/meminfo: {}", e))?;
    
    for line in meminfo.lines() {
        if line.starts_with("MemTotal:") {
            if let Some(memory_str) = line.split_whitespace().nth(1) {
                if let Ok(memory_kb) = memory_str.parse::<u64>() {
                    return Ok(memory_kb * 1024); // Convert KB to bytes
                }
            }
        }
    }
    
    Err("Could not find MemTotal in /proc/meminfo".to_string())
}

#[cfg(target_os = "windows")]
async fn get_available_memory() -> Result<u64, String> {
    use std::process::Command;
    
    let output = Command::new("wmic")
        .args(&["OS", "get", "FreePhysicalMemory", "/value"])
        .output()
        .map_err(|e| format!("Failed to get available memory: {}", e))?;
    
    let output_str = String::from_utf8_lossy(&output.stdout);
    for line in output_str.lines() {
        if line.starts_with("FreePhysicalMemory=") {
            if let Some(memory_str) = line.split('=').nth(1) {
                if let Ok(memory_kb) = memory_str.trim().parse::<u64>() {
                    return Ok(memory_kb * 1024); // Convert KB to bytes
                }
            }
        }
    }
    
    Err("Could not parse available memory information".to_string())
}

#[cfg(target_os = "macos")]
async fn get_available_memory() -> Result<u64, String> {
    use std::process::Command;
    
    let output = Command::new("vm_stat")
        .output()
        .map_err(|e| format!("Failed to get memory info: {}", e))?;
    
    let output_str = String::from_utf8_lossy(&output.stdout);
    let mut free_pages = 0u64;
    let mut page_size = 4096u64; // Default page size
    
    // Parse page size from the first line
    for line in output_str.lines() {
        if line.contains("page size of") {
            if let Some(size_str) = line.split("page size of ").nth(1) {
                if let Some(size_part) = size_str.split(" bytes").next() {
                    if let Ok(size) = size_part.parse::<u64>() {
                        page_size = size;
                        break;
                    }
                }
            }
        }
    }
    
    // Count free pages
    for line in output_str.lines() {
        if line.starts_with("Pages free:") {
            if let Some(pages_str) = line.split(':').nth(1) {
                if let Ok(pages) = pages_str.trim().replace('.', "").parse::<u64>() {
                    free_pages += pages;
                }
            }
        }
    }
    
    Ok(free_pages * page_size)
}

#[cfg(target_os = "linux")]
async fn get_available_memory() -> Result<u64, String> {
    use std::fs;
    
    let meminfo = fs::read_to_string("/proc/meminfo")
        .map_err(|e| format!("Failed to read /proc/meminfo: {}", e))?;
    
    for line in meminfo.lines() {
        if line.starts_with("MemAvailable:") {
            if let Some(memory_str) = line.split_whitespace().nth(1) {
                if let Ok(memory_kb) = memory_str.parse::<u64>() {
                    return Ok(memory_kb * 1024); // Convert KB to bytes
                }
            }
        }
    }
    
    Err("Could not find MemAvailable in /proc/meminfo".to_string())
}

async fn get_available_storage() -> Result<u64, String> {
    // Get available storage in the home directory (where models are likely to be stored)
    let home_dir = if cfg!(target_os = "windows") {
        std::env::var("USERPROFILE").or_else(|_| std::env::var("HOMEPATH"))
    } else {
        std::env::var("HOME")
    }.map_err(|_| "Could not determine home directory")?;
    
    get_available_storage_for_path(&home_dir).await
}

#[cfg(target_os = "windows")]
async fn get_available_storage_for_path(path: &str) -> Result<u64, String> {
    use std::process::Command;
    
    // Get the drive letter from the path
    let drive = if path.len() >= 2 && path.chars().nth(1) == Some(':') {
        &path[0..2]
    } else {
        "C:"
    };
    
    let output = Command::new("powershell")
        .args(&[
            "-Command",
            &format!("(Get-WmiObject -Class Win32_LogicalDisk | Where-Object {{$_.DeviceID -eq '{}'}}).FreeSpace", drive)
        ])
        .output()
        .map_err(|e| format!("Failed to get storage info: {}", e))?;
    
    let output_str = String::from_utf8_lossy(&output.stdout);
    output_str.trim().parse::<u64>()
        .map_err(|e| format!("Failed to parse storage size: {}", e))
}

#[cfg(target_os = "macos")]
async fn get_available_storage_for_path(path: &str) -> Result<u64, String> {
    use std::process::Command;
    
    // Try df command first - macOS uses different flags than Linux
    let output = Command::new("df")
        .args(&["-k", path]) // Get size in kilobytes (macOS compatible)
        .output()
        .map_err(|e| format!("Failed to execute df command: {}", e))?;
    
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("df command failed: {}", stderr));
    }
    
    let output_str = String::from_utf8_lossy(&output.stdout);
    
    // Check if output is empty
    if output_str.trim().is_empty() {
        return Err("df command returned empty output".to_string());
    }
    
    let lines: Vec<&str> = output_str.lines().collect();
    
    // Need at least 2 lines (header + data)
    if lines.len() < 2 {
        return Err(format!("df output has insufficient lines. Raw output: '{}'", output_str));
    }
    
    // Skip header line and find the data line
    for (i, line) in lines.iter().enumerate() {
        if i == 0 {
            continue; // Skip header
        }
        
        let fields: Vec<&str> = line.split_whitespace().collect();
        
        // df output can vary in format, but available space is typically the 4th field (index 3)
        // Sometimes filesystem name spans multiple lines, so check for various field counts
        if let Some(bytes) = parse_available_storage_kb_field(&fields, 3) {
            return Ok(bytes);
        } else if let Some(bytes) = parse_available_storage_kb_field(&fields, 2) {
            return Ok(bytes);
        }
    }
    
    
    Err(format!("Could not parse df output. Lines count: {}, Raw output: '{}'", lines.len(), output_str))
}

fn parse_available_storage_kb_field(fields: &[&str], index: usize) -> Option<u64> {
    if fields.len() > index {
        if let Ok(available_kb) = fields[index].parse::<u64>() {
            return Some(available_kb * 1024); // Convert KB to bytes
        }
    }
    None
}

#[cfg(target_os = "linux")]
async fn get_available_storage_for_path(path: &str) -> Result<u64, String> {
    use std::process::Command;
    
    // Try df command first - Linux supports -B1 for bytes
    let output = Command::new("df")
        .args(&["-B1", path]) // Get size in bytes (Linux compatible)
        .output()
        .map_err(|e| format!("Failed to execute df command: {}", e))?;
    
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("df command failed: {}", stderr));
    }
    
    let output_str = String::from_utf8_lossy(&output.stdout);
    
    // Check if output is empty
    if output_str.trim().is_empty() {
        return Err("df command returned empty output".to_string());
    }
    
    let lines: Vec<&str> = output_str.lines().collect();
    
    // Need at least 2 lines (header + data)
    if lines.len() < 2 {
        return Err(format!("df output has insufficient lines. Raw output: '{}'", output_str));
    }
    
    // Skip header line and find the data line
    for (i, line) in lines.iter().enumerate() {
        if i == 0 {
            continue; // Skip header
        }
        
        let fields: Vec<&str> = line.split_whitespace().collect();
        
        // df output can vary in format, but available space is typically the 4th field (index 3)
        // Sometimes filesystem name spans multiple lines, so check for various field counts
        if fields.len() >= 4 {
            if let Ok(available_bytes) = fields[3].parse::<u64>() {
                return Ok(available_bytes); // Already in bytes
            }
        } else if fields.len() >= 3 {
            // Sometimes available space is in the 3rd field
            if let Ok(available_bytes) = fields[2].parse::<u64>() {
                return Ok(available_bytes); // Already in bytes
            }
        }
    }
    
    Err(format!("Could not parse df output. Lines count: {}, Raw output: '{}'", lines.len(), output_str))
}

#[cfg(any(target_os = "ios", target_os = "android"))]
async fn get_total_memory() -> Result<u64, String> {
    Ok(4 * 1024 * 1024 * 1024)
}

#[cfg(any(target_os = "ios", target_os = "android"))]
async fn get_available_memory() -> Result<u64, String> {
    Ok(2 * 1024 * 1024 * 1024)
}

#[cfg(any(target_os = "ios", target_os = "android"))]
async fn get_available_storage_for_path(_path: &str) -> Result<u64, String> {
    Ok(10 * 1024 * 1024 * 1024)
}

#[tauri::command]
pub async fn get_system_info() -> Result<SystemResources, String> {
    // Add timeout to prevent hanging
    let timeout_duration = std::time::Duration::from_secs(10);
    
    match tokio::time::timeout(timeout_duration, get_system_resources()).await {
        Ok(result) => result,
        Err(_) => Err("System info request timed out after 10 seconds".to_string()),
    }
}

#[tauri::command]
pub async fn validate_model_system_compatibility(
    model_size_bytes: u64,
    model_name: String,
) -> Result<ModelCompatibility, String> {
    validate_model_compatibility(model_size_bytes, &model_name).await
}