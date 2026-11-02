defmodule OgmVoice.Ports.CommandSource do
  @moduledoc "Read-only open Commands from the briefing cache. Answering by voice is not supported."
  @behaviour VoiceConverse.Ports.CommandSource

  alias OgmVoice.Ports.BriefingSource

  @impl true
  def open(target) do
    case BriefingSource.entry(target) do
      {:ok, %{commands: commands}} when is_list(commands) -> {:ok, commands}
      _ -> {:error, :unavailable}
    end
  end

  @impl true
  def answer(_target, _id, _choice, _idempotency_key), do: {:error, :unsupported}

  @impl true
  def subscribe(_target, _pid), do: :unsupported
end
