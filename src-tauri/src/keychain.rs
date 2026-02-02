#[cfg(target_os = "ios")]
use security_framework::access_control::{SecAccessControl, ProtectionMode};
#[cfg(target_os = "ios")]
use security_framework::passwords::{set_generic_password_options, get_generic_password, delete_generic_password, PasswordOptions};

const SERVICE_NAME: &str = "org.weisssolutions.openchat";

#[cfg(target_os = "ios")]
#[tauri::command]
pub fn keychain_save(key: String, value: String) -> Result<(), String> {
    let access_control = SecAccessControl::create_with_protection(
        Some(ProtectionMode::AccessibleAfterFirstUnlock),
        0,
    ).map_err(|e| format!("Failed to create access control: {}", e))?;

    let mut options = PasswordOptions::new_generic_password(SERVICE_NAME, &key);
    options.set_access_control(access_control);

    set_generic_password_options(value.as_bytes(), options)
        .map_err(|e| format!("Failed to save to keychain: {}", e))
}

#[cfg(target_os = "ios")]
#[tauri::command]
pub fn keychain_get(key: String) -> Result<Option<String>, String> {
    match get_generic_password(SERVICE_NAME, &key) {
        Ok(bytes) => {
            String::from_utf8(bytes)
                .map(Some)
                .map_err(|e| format!("Failed to decode keychain value: {}", e))
        }
        Err(e) => {
            if e.code() == -25300 {
                Ok(None)
            } else {
                Err(format!("Failed to get from keychain: {}", e))
            }
        }
    }
}

#[cfg(target_os = "ios")]
#[tauri::command]
pub fn keychain_delete(key: String) -> Result<(), String> {
    match delete_generic_password(SERVICE_NAME, &key) {
        Ok(()) => Ok(()),
        Err(e) => {
            if e.code() == -25300 {
                Ok(())
            } else {
                Err(format!("Failed to delete from keychain: {}", e))
            }
        }
    }
}
