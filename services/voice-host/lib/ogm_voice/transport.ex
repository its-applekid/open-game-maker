defmodule OgmVoice.Transport do
  @moduledoc """
  The browser WebSocket: `VoiceConverse.Transport.WebSock`'s socket with two host hooks.

    * `start` is refused unless the target's `creator_id` is the token's subject, so a token the
      API minted for one creator cannot open another creator's target.
    * `confirm_draft` registers the socket with `OgmVoice.Delivery` first, so the API's answer
      reaches the browser as a `delivery` frame.

  The package verifies the token (scope `"converse"`) and closes with `4401` when it is missing or
  bad. The token is never logged or kept.
  """
  @behaviour Plug

  alias OgmVoice.{Delivery, Target, TranscriptDelivery}
  alias VoiceConverse.Ports
  alias VoiceConverse.Transport.WebSock, as: PackageTransport

  @impl true
  def init(opts), do: opts

  @impl true
  def call(%{method: "GET"} = conn, opts) do
    conn = Plug.Conn.fetch_query_params(conn)

    if conn.query_params["mode"] == "dictate" do
      upgrade_dictation(conn, opts)
    else
      upgrade_conversation(conn, opts)
    end
  end

  def call(conn, _opts), do: Plug.Conn.send_resp(conn, 404, "not found")

  defp upgrade_conversation(conn, opts) do
    claims = claims(conn, opts, "converse")
    api = if claims, do: api(opts[:instance], claims), else: %{}
    state = PackageTransport.socket_state(Keyword.put(opts, :api, api), not is_nil(claims))

    WebSockAdapter.upgrade(conn, PackageTransport.Socket, state,
      max_frame_size: PackageTransport.max_frame_bytes(),
      max_fragmented_message_size: PackageTransport.max_frame_bytes()
    )
  end

  defp upgrade_dictation(conn, opts) do
    with %{nonce: nonce, subject: subject, target: target} <- claims(conn, opts, "dictate"),
         ^subject <- Target.creator(target),
         dictation when is_list(dictation) <- Keyword.get(opts, :dictation),
         transcriber when is_atom(transcriber) <- Keyword.get(dictation, :transcriber) do
      state = %{
        nonce: nonce,
        leases: Keyword.get(dictation, :leases, OgmVoice.DictationLeases),
        transcriber: transcriber,
        transcriber_opts: Keyword.get(dictation, :transcriber_opts, [])
      }

      WebSockAdapter.upgrade(conn, OgmVoice.DictationSocket, state,
        max_frame_size: PackageTransport.max_frame_bytes(),
        max_fragmented_message_size: PackageTransport.max_frame_bytes()
      )
    else
      _unauthorized -> upgrade_unauthorized(conn, opts)
    end
  end

  defp upgrade_unauthorized(conn, opts) do
    state = PackageTransport.socket_state(opts, false)

    WebSockAdapter.upgrade(conn, PackageTransport.Socket, state,
      max_frame_size: PackageTransport.max_frame_bytes(),
      max_fragmented_message_size: PackageTransport.max_frame_bytes()
    )
  end

  defp api(instance, %{subject: subject, target: authorized_target}) do
    %{
      start_session: fn instance, target ->
        if target == authorized_target and Target.creator(target) == subject do
          case VoiceConverse.start_session(instance, target) do
            {:ok, conversation_id} = started ->
              case TranscriptDelivery.watch(instance, conversation_id, target) do
                :ok ->
                  started

                {:error, reason} ->
                  _ = VoiceConverse.end_session(instance, conversation_id, :transcript_delivery_unavailable)
                  {:error, reason}
              end

            {:error, _reason} = error ->
              error
          end
        else
          {:error, :forbidden}
        end
      end,
      confirm_draft: fn conversation_id, draft_id, edited_text ->
        :ok = Delivery.watch(draft_id, conversation_id, self())
        opts = [origin: :client] ++ if(is_nil(edited_text), do: [], else: [edited_text: edited_text])

        with {:error, _reason} = error <- VoiceConverse.confirm_draft(instance, conversation_id, draft_id, opts) do
          Delivery.unwatch(draft_id)
          error
        end
      end
    }
  end

  defp claims(conn, opts, scope) do
    with token when is_binary(token) <- token(conn),
         {:ok, %{subject: subject, target: target} = claims} when is_binary(subject) and is_map(target) <-
           Ports.call_port(opts[:token_issuer], :verify, [token, scope, []], :token) do
      claims
    else
      _ -> nil
    end
  end

  defp token(conn) do
    case Plug.Conn.get_req_header(conn, "authorization") do
      ["Bearer " <> token] when token != "" -> token
      [_ | _] -> nil
      [] -> Plug.Conn.fetch_query_params(conn).query_params["token"]
    end
  end
end
