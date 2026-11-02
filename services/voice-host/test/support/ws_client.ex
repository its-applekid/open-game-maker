defmodule OgmVoice.Test.WsClient do
  @moduledoc "A minimal real WebSocket client (Mint.WebSocket) for the end-to-end tests."

  @timeout 2_000

  @spec connect(:inet.port_number(), String.t()) :: {:ok, map()} | {:error, term()}
  def connect(port, path) do
    {:ok, conn} = Mint.HTTP.connect(:http, "127.0.0.1", port, protocols: [:http1])
    {:ok, conn, ref} = Mint.WebSocket.upgrade(:ws, conn, path, [])
    {conn, responses} = receive_responses(conn, ref, [])

    status =
      Enum.find_value(responses, fn
        {:status, ^ref, status} -> status
        _ -> nil
      end)

    headers =
      Enum.find_value(responses, [], fn
        {:headers, ^ref, headers} -> headers
        _ -> nil
      end)

    case Mint.WebSocket.new(conn, ref, status, headers) do
      {:ok, conn, websocket} ->
        # Frames sent right after the 101 (such as a 4401 close) can arrive in the same packet.
        early = for {:data, ^ref, data} <- responses, into: <<>>, do: data
        {:ok, websocket, frames} = Mint.WebSocket.decode(websocket, early)
        {:ok, %{conn: conn, ref: ref, websocket: websocket, buffer: Enum.map(frames, &decode/1)}}

      {:error, _conn, reason} ->
        {:error, reason}
    end
  end

  @spec send_json(map(), map()) :: map()
  def send_json(client, frame) do
    {:ok, websocket, data} = Mint.WebSocket.encode(client.websocket, {:text, Jason.encode!(frame)})
    {:ok, conn} = Mint.WebSocket.stream_request_body(client.conn, client.ref, data)
    %{client | conn: conn, websocket: websocket}
  end

  @doc "Reads frames until one matches `fun`; returns it with the client. Earlier frames are dropped."
  @spec await(map(), (term() -> boolean())) :: {term(), map()}
  def await(client, fun) do
    case Enum.split_while(client.buffer, &(not fun.(&1))) do
      {_skipped, [frame | rest]} ->
        {frame, %{client | buffer: rest}}

      {_skipped, []} ->
        receive do
          {tag, _socket, _data} = message when tag in [:tcp, :tcp_error] -> await(stream(client, message), fun)
          {:tcp_closed, _socket} = message -> await(stream(client, message), fun)
        after
          @timeout -> raise "no matching WebSocket frame within #{@timeout} ms"
        end
    end
  end

  # Only socket messages are taken from the mailbox, so other messages to the test process stay put.
  defp stream(client, message) do
    case Mint.WebSocket.stream(client.conn, message) do
      {:ok, conn, responses} ->
        data = for {:data, ref, data} <- responses, ref == client.ref, into: <<>>, do: data
        {:ok, websocket, frames} = Mint.WebSocket.decode(client.websocket, data)
        %{client | conn: conn, websocket: websocket, buffer: Enum.map(frames, &decode/1)}

      {:error, conn, _reason, _responses} ->
        %{client | conn: conn, buffer: [:closed]}

      # A late message from an earlier connection in the same test.
      :unknown ->
        client
    end
  end

  defp decode({:text, json}), do: Jason.decode!(json)
  defp decode(frame), do: frame

  defp receive_responses(conn, ref, acc) do
    receive do
      {:tcp, _socket, _data} = message ->
        {:ok, conn, responses} = Mint.WebSocket.stream(conn, message)
        acc = acc ++ responses
        if Enum.any?(acc, &match?({:done, ^ref}, &1)), do: {conn, acc}, else: receive_responses(conn, ref, acc)
    after
      @timeout -> raise "no WebSocket upgrade response within #{@timeout} ms"
    end
  end
end
