defmodule OgmVoice.NoCleanup do
  @moduledoc """
  Stand-in for the package's `ProviderCleanup` queue, which `transcript: :none` does not start.

  At the pinned `voice_converse`, a session still calls that queue when it ends, so without this
  process every conversation whose provider reported an id would crash at its end and the browser
  would never see `ended`. The host keeps no durable state, so a provider conversation is not
  queued for deletion: this acknowledges and logs the id (not a secret) until the package does
  cleanup in no-transcript mode itself (an upstream ask).
  """
  use GenServer

  require Logger

  def start_link(instance), do: GenServer.start_link(__MODULE__, :ok, name: name(instance))

  @doc "The name the package's session calls: `Module.concat(instance, VoiceConverse.ProviderCleanup)`."
  def name(instance), do: Module.concat(instance, VoiceConverse.ProviderCleanup)

  @impl true
  def init(:ok), do: {:ok, nil}

  @impl true
  def handle_call({:enqueue, provider_conversation_id, _conversation_id}, _from, state) do
    Logger.info("voice provider conversation #{provider_conversation_id} not queued for deletion (no transcript mode)")
    {:reply, :ok, state}
  end

  def handle_call(_request, _from, state), do: {:reply, {:error, :unsupported}, state}
end
