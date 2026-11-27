//! Cargo wrapper for collecting linker maps from the normal Moonlight workspace build.

use std::{
    env,
    ffi::OsString,
    path::PathBuf,
    process::{self, Command},
};

fn main() {
    let mut args = env::args_os().skip(1);
    let rustc = args.next().expect("Cargo must pass the rustc executable");
    let mut args: Vec<_> = args.collect();
    let is_binary = args
        .windows(2)
        .any(|pair| pair[0] == "--crate-type" && pair[1] == "bin");
    let binary = args.windows(2).find_map(|pair| {
        if pair[0] != "--crate-name" {
            return None;
        }
        match pair[1].to_str() {
            Some("web_server") => Some("web-server"),
            Some("streamer") => Some("streamer"),
            _ => None,
        }
    });
    if let Some(binary) = binary.filter(|_| is_binary) {
        let directory = env::var_os("POKEBOTS_RUNTIME_LINK_MAP_DIRECTORY")
            .expect("Set the linker map directory");
        let map = PathBuf::from(directory).join(format!("{binary}.map"));
        let mut flag = OsString::from(if cfg!(target_env = "msvc") {
            "-Clink-arg=/MAP:"
        } else if cfg!(target_os = "macos") {
            "-Clink-arg=-Wl,-map,"
        } else {
            "-Clink-arg=-Wl,-Map,"
        });
        flag.push(map);
        args.push(flag);
    }
    let status = Command::new(rustc).args(args).status().expect("Run rustc");
    process::exit(status.code().unwrap_or(1));
}
