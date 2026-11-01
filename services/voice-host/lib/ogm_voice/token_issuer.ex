defmodule OgmVoice.TokenIssuer do
  @moduledoc """
  The package's HMAC issuer (`vct1.<payload>.<mac>`) bound to the host's one instance. The API
  mints the same format in TypeScript with the shared `OGM_VOICE_TOKEN_SECRET`.
  """
  @behaviour VoiceConverse.Ports.TokenIssuer

  alias VoiceConverse.TokenIssuer.Hmac

  @doc "Installs the secret as a function, so the value is read at use time and never stored."
  @spec install((-> String.t() | nil)) :: :ok
  def install(secret) when is_function(secret, 0), do: Hmac.put_secret(OgmVoice.Config.instance(), secret)

  @impl true
  def issue(scope, opts \\ []), do: Hmac.issue(scope, bind(opts))

  @impl true
  def verify(token, scope, opts \\ []), do: Hmac.verify(token, scope, bind(opts))

  defp bind(opts), do: Keyword.put(opts, :instance, OgmVoice.Config.instance())
end
