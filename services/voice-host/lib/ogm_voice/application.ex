defmodule OgmVoice.Application do
  @moduledoc false
  use Application

  @impl true
  def start(_type, _args) do
    children = if Application.get_env(:ogm_voice, :autostart, true), do: children(OgmVoice.Config.from_env!()), else: []
    Supervisor.start_link(children, strategy: :one_for_one, name: OgmVoice.Supervisor)
  end

  @doc "The supervision tree for one host. Every listener binds IPv4 loopback."
  @spec children(OgmVoice.Config.t()) :: [Supervisor.child_spec() | {module(), term()}]
  def children(%OgmVoice.Config{} = config) do
    :ok = OgmVoice.TokenIssuer.install(config.token_secret)
    :ok = OgmVoice.Ports.CommandSource.install(config.api_internal_url, config.internal_secret)
    :ok = File.mkdir_p(config.render_dir)
    :ok = File.chmod(config.render_dir, 0o700)

    [
      OgmVoice.Cache,
      OgmVoice.DictationLeases,
      {OgmVoice.Delivery, api_url: config.api_internal_url, secret: config.internal_secret},
      {OgmVoice.TranscriptDelivery, api_url: config.api_internal_url, secret: config.internal_secret},
      {OgmVoice.NoCleanup, OgmVoice.Config.instance()},
      VoiceConverse.child_spec(OgmVoice.Config.voice_converse(config)),
      Supervisor.child_spec(
        {Bandit,
         plug:
           {OgmVoice.Transport,
            instance: OgmVoice.Config.instance(),
            token_issuer: OgmVoice.TokenIssuer,
            dictation: OgmVoice.Config.dictation(config)},
         scheme: :http,
         ip: {127, 0, 0, 1},
         port: config.port,
         startup_log: false},
        id: :voice_socket
      ),
      Supervisor.child_spec(
        {Bandit,
         plug:
           {OgmVoice.HTTP.Router,
            secret: config.internal_secret, provider: config.provider, narration: narration(config)},
         scheme: :http,
         ip: {127, 0, 0, 1},
         port: config.internal_port,
         startup_log: false},
        id: :internal_http
      )
    ]
  end

  # Off unless OGM_VOICE_NARRATION_ENABLED is set: a provider key alone never starts a paid render.
  defp narration(%OgmVoice.Config{narration_enabled: true} = config), do: fn -> OgmVoice.Config.narration(config) end
  defp narration(_config), do: :disabled
end
