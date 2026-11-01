defmodule OgmVoice.TokenIssuer do
  @moduledoc """
  The package's HMAC issuer (`vct1.<payload>.<mac>`) bound to the host's one instance. The API
  mints the same format in TypeScript with the shared `OGM_VOICE_TOKEN_SECRET`.
  """
  @behaviour VoiceConverse.Ports.TokenIssuer

  alias VoiceConverse.TokenIssuer.Hmac

  @secret_key {__MODULE__, :secret}
  @min_secret_bytes 32
  @default_ttl_s 300
  @max_ttl_s 3_600

  @doc "Installs the secret as a function, so the value is read at use time and never stored."
  @spec install((-> String.t() | nil)) :: :ok
  def install(secret) when is_function(secret, 0) do
    :persistent_term.put(@secret_key, secret)
    Hmac.put_secret(OgmVoice.Config.instance(), secret)
  end

  @impl true
  def issue(scope, opts \\ []) when is_binary(scope) do
    ttl_s = Keyword.get(opts, :ttl_s, @default_ttl_s)

    with target when is_map(target) <- Keyword.get(opts, :target),
         {:ok, _key} <- OgmVoice.Target.key(target),
         secret when is_binary(secret) and byte_size(secret) >= @min_secret_bytes <- secret(),
         true <- is_integer(ttl_s) and ttl_s > 0 and ttl_s <= @max_ttl_s do
      expires_at = DateTime.add(Keyword.get_lazy(opts, :now, &DateTime.utc_now/0), ttl_s, :second)

      payload = %{
        "scope" => scope,
        "sub" => Keyword.get(opts, :subject),
        "exp" => DateTime.to_unix(expires_at),
        "nonce" => Base.url_encode64(:crypto.strong_rand_bytes(12), padding: false),
        "target" => target
      }

      body = "vct1." <> Base.url_encode64(Jason.encode!(payload), padding: false)
      mac = :crypto.mac(:hmac, :sha256, secret, body)
      {:ok, body <> "." <> Base.url_encode64(mac, padding: false), DateTime.truncate(expires_at, :second)}
    else
      _ -> {:error, :invalid}
    end
  end

  @impl true
  def verify(token, scope, opts \\ []) do
    with {:ok, claims} <- Hmac.verify(token, scope, bind(opts)),
         {:ok, target} <- signed_target(token) do
      {:ok, Map.put(claims, :target, target)}
    end
  end

  defp bind(opts), do: Keyword.put(opts, :instance, OgmVoice.Config.instance())

  defp secret do
    case :persistent_term.get(@secret_key, nil) do
      fun when is_function(fun, 0) -> fun.()
      _ -> nil
    end
  end

  defp signed_target(token) do
    with ["vct1", payload, _mac] <- String.split(token, ".", parts: 3),
         {:ok, json} <- Base.url_decode64(payload, padding: false),
         {:ok, %{"target" => target}} when is_map(target) <- Jason.decode(json),
         {:ok, _key} <- OgmVoice.Target.key(target) do
      {:ok, target}
    else
      _ -> {:error, :invalid}
    end
  end
end
