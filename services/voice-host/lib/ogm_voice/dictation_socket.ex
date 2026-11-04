defmodule OgmVoice.DictationSocket do
  @moduledoc """
  Bounded WebSocket owner for one target-bound Scribe dictation session.

  The pinned transcriber owns provider protocol, buffering, credentials and the
  commit flush. This module owns only OGM token replay protection and its small
  browser wire.
  """

  @behaviour WebSock

  @deadline_ms 120_000
  @max_audio_bytes 64_000

  @impl true
  def init(opts) do
    nonce = Map.fetch!(opts, :nonce)
    leases = Map.get(opts, :leases, OgmVoice.DictationLeases)
    transcriber = Map.fetch!(opts, :transcriber)
    transcriber_opts = Keyword.put(Map.get(opts, :transcriber_opts, []), :owner, self())
    scheduler = Map.get(opts, :deadline_scheduler, &default_deadline_scheduler/1)

    state = %{transcriber: transcriber, session: nil, committed?: false, closed?: false}

    with :ok <- OgmVoice.DictationLeases.claim(leases, nonce, self()),
         {:ok, session} <- transcriber.start(transcriber_opts) do
      scheduler.(@deadline_ms)
      {:ok, %{state | session: session}}
    else
      {:error, :replayed} ->
        send(self(), {:dictation_start_error, "token_replayed", "Dictation token was already used."})
        {:ok, state}

      {:error, :unconfigured} ->
        send(self(), {:dictation_start_error, "provider_unconfigured", "Dictation is not configured."})
        {:ok, state}

      {:error, _reason} ->
        send(self(), {:dictation_start_error, "provider_unavailable", "Dictation could not start."})
        {:ok, state}
    end
  end

  @impl true
  def handle_in({payload, [opcode: opcode]}, state), do: handle_in({payload, opcode}, state)

  def handle_in({payload, :text}, state) when is_binary(payload) do
    with {:ok, frame} <- Jason.decode(payload) do
      dispatch(frame, state)
    else
      _error -> error(state, "invalid_frame", "Invalid dictation frame.")
    end
  end

  def handle_in({_payload, _opcode}, state), do: error(state, "invalid_frame", "Dictation frames must be JSON text.")

  @impl true
  def handle_info({:voice_transcript, kind, text}, state)
      when kind in [:partial, :final] and is_binary(text) do
    push(state, %{v: 1, type: "transcript", kind: Atom.to_string(kind), text: text})
  end

  def handle_info({:voice_error, %{code: code, message: message}}, state) when is_binary(message) do
    error(state, safe_code(code), String.slice(message, 0, 240))
  end

  def handle_info({:dictation_start_error, code, message}, state), do: error(state, code, message)

  def handle_info({:voice_closed}, state) do
    push(%{state | closed?: true}, %{v: 1, type: "ended"})
  end

  def handle_info(:dictation_deadline, %{closed?: false} = state) do
    stop(state)
    error(%{state | closed?: true}, "duration_limit", "Dictation reached its time limit.")
  end

  def handle_info(_message, state), do: {:ok, state}

  @impl true
  def handle_control(_frame, state), do: {:ok, state}

  @impl true
  def terminate(_reason, state) do
    stop(state)
    :ok
  end

  defp dispatch(%{"v" => 1, "type" => "audio", "data_b64" => audio}, %{session: session} = state)
       when is_binary(audio) and is_pid(session) and not state.committed? and not state.closed? do
    case Base.decode64(audio) do
      {:ok, decoded} when byte_size(decoded) in 1..@max_audio_bytes ->
        state.transcriber.push(session, audio)
        {:ok, state}

      _error ->
        error(state, "invalid_frame", "Invalid dictation audio frame.")
    end
  end

  defp dispatch(%{"v" => 1, "type" => "commit"}, %{session: session, committed?: false} = state)
       when is_pid(session) and not state.closed? do
    state.transcriber.commit(session)
    {:ok, %{state | committed?: true}}
  end

  defp dispatch(%{"v" => 1, "type" => "commit"}, %{committed?: true} = state), do: {:ok, state}

  defp dispatch(%{"v" => 1, "type" => "stop"}, state) do
    stop(state)
    push(%{state | closed?: true}, %{v: 1, type: "ended"})
  end

  defp dispatch(_frame, state), do: error(state, "invalid_frame", "Invalid dictation frame.")

  defp stop(%{session: session, transcriber: transcriber}) when is_pid(session), do: transcriber.stop(session)
  defp stop(_state), do: :ok

  defp push(state, frame), do: {:push, {:text, Jason.encode!(frame)}, state}

  defp error(state, code, message),
    do: push(state, %{v: 1, type: "error", code: code, message: message})

  defp safe_code(code) when is_atom(code), do: code |> Atom.to_string() |> safe_code()
  defp safe_code(code) when is_binary(code) and byte_size(code) in 1..64, do: code
  defp safe_code(_code), do: "provider_error"

  defp default_deadline_scheduler(delay), do: Process.send_after(self(), :dictation_deadline, delay)
end
