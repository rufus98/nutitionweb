//! "Avviata come amministratore?": la sezione Amministrazione delle Impostazioni (configurazione del server e del
//! database esterno) compare solo se Nutrea Studio è stato avviato con "Esegui come amministratore" in Windows.

/// true se il processo ha i privilegi di amministratore (token elevato in Windows, root su Linux/macOS).
#[tauri::command]
pub fn is_admin() -> bool {
    elevated()
}

#[cfg(windows)]
fn elevated() -> bool {
    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
    use windows_sys::Win32::Security::{GetTokenInformation, TokenElevation, TOKEN_ELEVATION, TOKEN_QUERY};
    use windows_sys::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};
    // SAFETY: chiamate Win32 documentate; il token viene chiuso in ogni caso e la struttura ha la dimensione attesa.
    unsafe {
        let mut token: HANDLE = std::ptr::null_mut();
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) == 0 {
            return false;
        }
        let mut elevation = TOKEN_ELEVATION { TokenIsElevated: 0 };
        let mut len = 0u32;
        let ok = GetTokenInformation(
            token,
            TokenElevation,
            &mut elevation as *mut TOKEN_ELEVATION as *mut core::ffi::c_void,
            std::mem::size_of::<TOKEN_ELEVATION>() as u32,
            &mut len,
        );
        CloseHandle(token);
        ok != 0 && elevation.TokenIsElevated != 0
    }
}

#[cfg(unix)]
fn elevated() -> bool {
    extern "C" {
        fn geteuid() -> u32;
    }
    // SAFETY: geteuid non ha precondizioni.
    unsafe { geteuid() == 0 }
}

#[cfg(not(any(windows, unix)))]
fn elevated() -> bool {
    false
}
