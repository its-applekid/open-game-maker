defmodule OgmVoice.Test.ApiStub do
  @moduledoc "Stands in for the API's `/internal/voice/instruct`: forwards each request to the test process."
  @behaviour Plug

  import Plug.Conn

  @impl true
  def init(opts), do: opts

  @impl true
  def call(conn, opts) do
    {:ok, body, conn} = read_body(conn)
    send(opts[:test], {:api_stub, conn.method, conn.request_path, get_req_header(conn, "x-ogm-internal"), body})
    Process.sleep(opts[:delay_ms] || 0)
    send_resp(conn, opts[:status] || 200, opts[:body] || ~s({"delivery_id":"d-1","status":"delivered"}))
  end

  @doc "Starts the stub on a free loopback port and returns its base URL."
  def start!(test_pid, status \\ 200, delay_ms \\ 0, body \\ nil) do
    {:ok, pid} =
      Bandit.start_link(
        plug: {__MODULE__, test: test_pid, status: status, delay_ms: delay_ms, body: body},
        ip: {127, 0, 0, 1},
        port: 0,
        startup_log: false
      )

    {:ok, {_ip, port}} = ThousandIsland.listener_info(pid)
    {pid, "http://127.0.0.1:#{port}"}
  end
end
