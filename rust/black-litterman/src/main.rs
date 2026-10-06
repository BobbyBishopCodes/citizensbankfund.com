use std::io::{self, Read};

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.len() == 3 && args[0] == "--refresh" {
        let result = std::fs::read(&args[1])
            .map_err(|error| error.to_string())
            .and_then(|holdings| {
                std::fs::read(&args[2])
                    .map_err(|error| error.to_string())
                    .and_then(|config| cbf_black_litterman::refresh_json(&holdings, &config))
            });
        match result {
            Ok(json) => println!("{json}"),
            Err(error) => {
                eprintln!("{error}");
                std::process::exit(1);
            }
        }
    } else if args.is_empty() {
        let mut input = Vec::new();
        if io::stdin().read_to_end(&mut input).is_err() {
            std::process::exit(1);
        }
        println!("{}", cbf_black_litterman::calculate_json(&input));
    } else {
        std::process::exit(1);
    }
}
