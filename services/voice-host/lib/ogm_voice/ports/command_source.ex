defmodule OgmVoice.Ports.CommandSource do
  @moduledoc "Open Commands from the briefing cache with authenticated answers through the OGM API."
  @behaviour VoiceConverse.Ports.CommandSource

  alias OgmVoice.Ports.BriefingSource

  @settings_key {__MODULE__, :settings}
  # The API answers through Aiur's Decision API before it replies, so the bound matches
  # `OgmVoice.Delivery`'s loopback call rather than a local round trip.
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
         payload = %{target: target, command_id: id, choice: choice, idempotency_key: idempotency_key},
         {:ok, status, body} <- request.(url <> "/internal/voice/command-answer", secret.(), payload) do
      case {status, body} do
        {status, %{"status" => "answered"}} when status in 200..299 -> :ok
        {409, %{"status" => "stale"}} -> {:error, :stale}
        _failure -> {:error, :unavailable}
      end
    else
      _failure -> {:error, :unavailable}
    end
  rescue
    _error -> {:error, :unavailable}
  catch
    _kind, _reason -> {:error, :unavailable}
  end

  def answer(_target, _id, _choice, _idempotency_key), do: {:error, :unavailable}

  @impl true
  def subscribe(_target, _pid), do: :unsupported

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
