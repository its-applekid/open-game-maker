defmodule OgmVoice.MixProject do
  use Mix.Project

  # `voice_converse` comes from a merged Aiur commit; the Scribe transcriber package is pinned to the
  # head of its upstream pull request until that pull request merges (aiur #7523), so a bump is all
  # the integration needs afterwards.
  @aiur_pin "ae181819deba65dd187191c1e58edba8934891dd"
  @aiur_transcribe_pin "76e52e86ea5e2c38415ac3f584f0e1fb70440be6"

  def project do
    [
      app: :ogm_voice,
      version: "0.1.0",
      elixir: "~> 1.19",
      start_permanent: Mix.env() == :prod,
      elixirc_paths: elixirc_paths(Mix.env()),
      deps: deps(),
      releases: [voice_host: [applications: [ogm_voice: :permanent]]]
    ]
  end

  def application do
    [extra_applications: [:logger, :crypto, :inets], mod: {OgmVoice.Application, []}]
  end

  defp elixirc_paths(:test), do: ["lib", "test/support"]
  defp elixirc_paths(_env), do: ["lib"]

  defp deps do
    [
      {:voice_converse,
       git: System.get_env("OGM_AIUR_GIT", "https://github.com/its-everdred/aiur.git"),
       sparse: "packages/elixir/voice_converse",
       ref: @aiur_pin},
      {:voice_transcribe,
       git: System.get_env("OGM_AIUR_GIT", "https://github.com/its-everdred/aiur.git"),
       sparse: "packages/elixir/voice_transcribe",
       ref: @aiur_transcribe_pin},
      {:bandit, "== 1.12.5"},
      {:websock_adapter, "== 0.6.0"},
      {:plug, "== 1.20.3"},
      {:jason, "== 1.4.5"},
      {:mint, "== 1.11.0"},
      {:mint_web_socket, "== 1.0.6"}
    ]
  end
end
