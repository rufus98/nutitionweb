// Nasconde la console su Windows nelle build di release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    nutrea_studio_lib::run()
}
