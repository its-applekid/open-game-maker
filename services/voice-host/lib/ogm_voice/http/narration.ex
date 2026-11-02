defmodule OgmVoice.HTTP.Narration do
  @moduledoc "Batch narration adapter for the voice host's authenticated internal HTTP surface."

  alias VoiceConverse.Events

  @formats %{
    "pcm_16000" => :pcm_16000,
    "pcm_24000" => :pcm_24000,
    "pcm_44100" => :pcm_44100
  }

  @spec render(map(), (-> keyword()) | nil) :: {pos_integer(), map()}
  def render(request, options) when is_map(request) and is_function(options, 0) do
    with {:ok, text, voice_id, format} <- validate(request),
         opts <- options.(),
         path <- render_path(opts, text, voice_id, format),
         {:ok, result} <-
           VoiceConverse.Narration.render_to_file(
             text,
             path,
             provider: Keyword.fetch!(opts, :provider),
             privacy: Keyword.fetch!(opts, :privacy),
             credentials: {Keyword.fetch!(opts, :credentials), Keyword.fetch!(opts, :provider_id)},
             format: format,
             voice_id: voice_id,
             max_chars: 5_000,
             timeout_ms: 60_000
           ) do
      {200, %{wav_path: result.path, format: result.format, alignment: result.alignment}}
    else
      {:error, :unsupported} -> {501, %{error: "provider_has_no_render"}}
      {:error, %{field: :text, reason: :too_long}} -> {400, %{error: "text_too_long"}}
      {:error, %{field: :text}} -> {400, %{error: "invalid_text"}}
      {:error, %{field: :format}} -> {400, %{error: "unsupported_format"}}
      {:error, %Events.Error{code: :provider_auth}} -> {503, %{error: "provider_auth"}}
      {:error, %Events.Error{code: code}} -> {502, %{error: Atom.to_string(code)}}
      {:error, {:write_failed, _reason}} -> {500, %{error: "render_write_failed"}}
      {:error, :invalid_request} -> {400, %{error: "invalid_request"}}
    end
  end

  def render(_request, _options), do: {503, %{error: "narration_unavailable"}}

  defp validate(request) do
    text = Map.get(request, "text")
    voice_id = Map.get(request, "voice_id", "default")
    format = Map.get(request, "format", "pcm_24000")

    cond do
      not is_binary(text) -> {:error, :invalid_request}
      not is_binary(voice_id) or String.trim(voice_id) == "" -> {:error, :invalid_request}
      not Map.has_key?(@formats, format) -> {:error, %{field: :format, reason: :unsupported}}
      true -> {:ok, text, voice_id, Map.fetch!(@formats, format)}
    end
  end

  defp render_path(opts, text, voice_id, format) do
    provider_id = Keyword.fetch!(opts, :provider_id)
    input = Jason.encode!(%{format: format, provider: provider_id, text: text, voice_id: voice_id})
    key = :crypto.hash(:sha256, input) |> Base.encode16(case: :lower)
    Path.join(Keyword.fetch!(opts, :render_dir), key <> ".wav")
  end
end
