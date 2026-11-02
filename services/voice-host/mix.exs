defmodule OgmVoice.MixProject do
  use Mix.Project

  @aiur_pin "0f692a45b04bb4ce3e7d8256e134028894bd128b"

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
      {:bandit, "== 1.12.5"},
      {:websock_adapter, "== 0.6.0"},
      {:plug, "== 1.20.3"},
      {:jason, "== 1.4.5"},
      {:mint, "== 1.11.0"},
      {:mint_web_socket, "== 1.0.6"}
    ]
  end
end
