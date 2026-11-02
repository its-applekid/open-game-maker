defmodule OgmVoice.Ports.AgentChannel do
  @moduledoc """
  Delivers a confirmed instruction to the API's `/internal/voice/instruct`. `instruct/4` only
  enqueues and returns at once; `OgmVoice.Delivery` posts it and reports the outcome to the socket.
  Asking the agent and forking are not offered.
  """
  @behaviour VoiceConverse.Ports.AgentChannel

  @impl true
  def capabilities(_target), do: %{fork: :none, ask: false, instruct: true}

  @impl true
  def instruct(target, text, idempotency_key, _opts) do
    :ok = OgmVoice.Delivery.enqueue(target, text, idempotency_key, :instruct)
    {:ok, idempotency_key}
  end

  @impl true
  def ask(_target, _question, _ref, _opts), do: {:error, :unsupported}

  @impl true
  def fork_query(_target, _question, _opts), do: {:error, :unsupported}

  @impl true
  def subscribe(_target, _pid), do: :unsupported
end
