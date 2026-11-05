defmodule OgmVoice.Ports.CommandSource do
  @moduledoc """
  Open Commands from the briefing cache with authenticated answers through the OGM API.

  The package runs `answer/4` under a 300 ms `:answer` port deadline, so this port decides
  staleness and option validity from the cached briefing and hands the Decision call to the API
  without waiting for it. The package's idempotency key makes a retried answer safe.
  """
  @behaviour VoiceConverse.Ports.CommandSource

  require Logger

  alias OgmVoice.Ports.BriefingSource

  @settings_key {__MODULE__, :settings}
  @request_timeout_ms 5_000
  @connect_timeout_ms 1_000

  @doc false
  @spec install(String.t(), (-> String.t() | nil), keyword()) :: :ok
  def install(api_url, secret, opts \\ []) when is_binary(api_url) and is_function(secret, 0) do
    request = Keyword.get(opts, :request, &request/3)
    :persistent_term.put(@settings_key, {String.trim_trailing(api_url, "/"), secret, request})
    :ok
  end

  @doc false
  def uninstall do
    :persistent_term.erase(@settings_key)
    :ok
  end

  @impl true
  def open(target) do
    case BriefingSource.entry(target) do
      {:ok, %{commands: commands}} when is_list(commands) -> {:ok, commands}
      _ -> {:error, :unavailable}
    end
  end

  @impl true
  def answer(target, id, choice, idempotency_key)
      when is_map(target) and is_binary(id) and is_binary(choice) and is_binary(idempotency_key) do
    with {url, secret, request} <- :persistent_term.get(@settings_key, nil),
         {:ok, command} <- open_command(target, id),
         {:ok, selection} <- selection(command, choice) do
      post_answer(request, url, secret, %{
        target: target,
        command_id: id,
        choice: selection,
        idempotency_key: idempotency_key
      })
    else
      {:error, :stale} = stale -> stale
      {:error, :invalid_choice} = invalid -> invalid
      _failure -> {:error, :unavailable}
    end
  end

  def answer(_target, _id, _choice, _idempotency_key), do: {:error, :unavailable}

  @impl true
  def subscribe(_target, _pid), do: :unsupported

  # The cache holds the target's open Commands, so a Command that is no longer there is stale
  # without a round trip the port deadline could not afford.
  defp open_command(target, id) do
    case BriefingSource.entry(target) do
      {:ok, %{commands: commands}} when is_list(commands) ->
        case Enum.find(commands, &(&1.id == id)) do
          nil -> {:error, :stale}
          command -> {:ok, command}
        end

      _missing ->
        {:error, :unavailable}
    end
  end

  # The agent read these options aloud, so anything else is refused here rather than dropped after
  # the port has already answered.
  defp selection(%{options: options}, choice) when is_list(options) and options != [] do
    folded = String.downcase(choice)

    matches =
      Enum.filter(options, fn option ->
        String.downcase(Map.get(option, "id", "")) == folded or
          String.downcase(Map.get(option, "label", "")) == folded
      end)

    if length(matches) == 1, do: {:ok, choice}, else: {:error, :invalid_choice}
  end

  defp selection(_command, choice) do
    if String.trim(choice) == "", do: {:error, :invalid_choice}, else: {:ok, choice}
  end

  # The package kills the port caller at its `:answer` deadline, so the POST outlives the call and
  # reports its outcome to the log; the idempotency key makes a retry safe.
  defp post_answer(request, url, secret, payload) do
    spawn(fn -> log_outcome(safely(fn -> request.(url, secret.(), payload) end)) end)
    :ok
  end

  defp safely(fun) do
    fun.()
  rescue
    _error -> {:error, :raised}
  catch
    _kind, _reason -> {:error, :raised}
  end

  defp log_outcome({:ok, status, %{"status" => "answered"}}) when status in 200..299, do: :ok
  defp log_outcome({:ok, 409, _body}), do: Logger.warning("voice command answer was stale")
  defp log_outcome(_failure), do: Logger.warning("voice command answer delivery failed")

  defp request(url, secret, payload) do
    headers = [
      {~c"content-type", ~c"application/json"},
      {~c"x-ogm-internal", String.to_charlist(secret || "")}
    ]

    request = {String.to_charlist(url), headers, ~c"application/json", Jason.encode!(payload)}

    case :httpc.request(
           :post,
           request,
           [timeout: @request_timeout_ms, connect_timeout: @connect_timeout_ms],
           body_format: :binary
         ) do
      {:ok, {{_http_version, status, _reason}, _headers, body}} ->
        case Jason.decode(body) do
          {:ok, decoded} -> {:ok, status, decoded}
          _invalid -> {:error, :invalid_response}
        end

      {:error, reason} ->
        {:error, reason}
    end
  end
end
