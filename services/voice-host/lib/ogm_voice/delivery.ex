defmodule OgmVoice.Delivery do
  @moduledoc """
  Posts confirmed drafts to the API (`POST <api>/internal/voice/instruct` with `X-OGM-Internal`)
  outside the session process, then tells the socket that confirmed the draft how it went.

  At the pinned `voice_converse`, an instruction draft stops at `confirmed`: only consult drafts
  consume receipts. So the socket registers with `watch/3` before confirming, and the outcome
  reaches it as the transport's own draft event, which it renders as
  `{"type":"delivery","status":"delivered"|"failed"}`.
  """
  use GenServer

  require Logger

  @timeout_ms 5_000

  def start_link(opts), do: GenServer.start_link(__MODULE__, opts, name: __MODULE__)

  @doc "Routes the outcome for `draft_id` to `socket` as an event of `conversation_id`."
  @spec watch(String.t(), String.t(), pid()) :: :ok
  def watch(draft_id, conversation_id, socket),
    do: GenServer.call(__MODULE__, {:watch, draft_id, conversation_id, socket})

  @spec unwatch(String.t()) :: :ok
  def unwatch(draft_id), do: GenServer.cast(__MODULE__, {:unwatch, draft_id})

  @spec enqueue(map(), String.t(), String.t(), :instruct | :ask) :: :ok
  def enqueue(target, text, idempotency_key, kind),
    do: GenServer.cast(__MODULE__, {:enqueue, target, text, idempotency_key, kind})

  @impl true
  def init(opts) do
    {:ok, tasks} = Task.Supervisor.start_link()

    {:ok,
     %{
       url: String.trim_trailing(Keyword.fetch!(opts, :api_url), "/") <> "/internal/voice/instruct",
       secret: Keyword.fetch!(opts, :secret),
       tasks: tasks,
       watchers: %{}
     }}
  end

  @impl true
  def handle_call({:watch, draft_id, conversation_id, socket}, _from, state) do
    watchers = drop_watch(state.watchers, draft_id)
    monitor = Process.monitor(socket)
    {:reply, :ok, %{state | watchers: Map.put(watchers, draft_id, {conversation_id, socket, monitor})}}
  end

  @impl true
  def handle_cast({:unwatch, draft_id}, state),
    do: {:noreply, %{state | watchers: drop_watch(state.watchers, draft_id)}}

  def handle_cast({:enqueue, target, text, key, kind}, state) do
    body = Jason.encode!(%{target: target, text: text, idempotency_key: key, kind: kind})
    %{url: url, secret: secret} = state
    Task.Supervisor.async_nolink(state.tasks, fn -> {key, post(url, secret, body)} end)
    {:noreply, state}
  end

  @impl true
  def handle_info({ref, {key, status}}, state) when is_reference(ref) do
    Process.demonitor(ref, [:flush])

    case Map.pop(state.watchers, key) do
      {{conversation_id, socket, monitor}, watchers} ->
        Process.demonitor(monitor, [:flush])
        send(socket, {:voice_conversation, conversation_id, {:draft, %{draft_id: key, status: Atom.to_string(status)}}})
        {:noreply, %{state | watchers: watchers}}

      {nil, _watchers} ->
        {:noreply, state}
    end
  end

  def handle_info({:DOWN, ref, :process, _pid, _reason}, state) do
    {:noreply, update_in(state.watchers, &Map.reject(&1, fn {_key, {_id, _socket, monitor}} -> monitor == ref end))}
  end

  def handle_info(_message, state), do: {:noreply, state}

  defp drop_watch(watchers, key) do
    case Map.pop(watchers, key) do
      {{_conversation_id, _socket, monitor}, watchers} ->
        Process.demonitor(monitor, [:flush])
        watchers

      {nil, watchers} ->
        watchers
    end
  end

  defp post(url, secret, body) do
    headers = [{~c"x-ogm-internal", String.to_charlist(secret.() || "")}]
    request = {String.to_charlist(url), headers, ~c"application/json", body}

    case :httpc.request(:post, request, [timeout: @timeout_ms, connect_timeout: @timeout_ms], []) do
      {:ok, {{_version, status, _reason}, _headers, response_body}} when status in 200..299 ->
        if valid_receipt?(response_body) do
          :delivered
        else
          Logger.warning("voice instruct delivery returned an invalid receipt")
          :failed
        end

      {:ok, {{_version, status, _reason}, _headers, _body}} ->
        Logger.warning("voice instruct delivery refused: HTTP #{status}")
        :failed

      {:error, reason} ->
        Logger.warning("voice instruct delivery failed: #{inspect(reason)}")
        :failed
    end
  end

  defp valid_receipt?(body) do
    case Jason.decode(body) do
      {:ok, %{"delivery_id" => id}} when is_binary(id) and id != "" -> true
      _ -> false
    end
  end
end
