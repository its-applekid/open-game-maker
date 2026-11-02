defmodule OgmVoice.Ports.Credentials do
  @moduledoc "Provider keys read from the unit's environment at the moment of use, never kept or logged."
  @behaviour VoiceConverse.Ports.Credentials

  @env_names %{
    elevenlabs: "ELEVENLABS_API_KEY",
    elevenlabs_agents: "ELEVENLABS_API_KEY",
    openai: "OPENAI_API_KEY",
    openai_realtime: "OPENAI_API_KEY"
  }

  @impl true
  def fetch(:fake, :probe), do: {:ok, :present}
  def fetch(:fake, _purpose), do: {:ok, "fake"}

  def fetch(provider, purpose) do
    with name when is_binary(name) <- Map.get(@env_names, provider),
         key when is_binary(key) <- System.get_env(name),
         false <- String.trim(key) == "" do
      if purpose == :probe, do: {:ok, :present}, else: {:ok, key}
    else
      _ -> {:error, :missing}
    end
  end
end
