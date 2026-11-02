import Config

# Tests start the tree themselves with injected ports and secrets.
config :ogm_voice, autostart: config_env() != :test
