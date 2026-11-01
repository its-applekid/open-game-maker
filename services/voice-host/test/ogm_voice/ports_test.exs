defmodule OgmVoice.PortsTest do
  use ExUnit.Case, async: false

  alias OgmVoice.Ports.AgentChannel
  alias OgmVoice.Test.ApiStub
  alias VoiceConverse.Ports

  @internal_secret "ogm-ports-internal-secret-0123456789abcdef"
  @target %{"kind" => "build", "game_id" => "g1", "job_id" => "j1", "ticket" => "142", "creator_id" => "u1"}

  setup do
    {stub, api_url} = ApiStub.start!(self(), 200, 500)
    on_exit(fn -> Process.exit(stub, :shutdown) end)
    start_supervised!({OgmVoice.Delivery, api_url: api_url, secret: fn -> @internal_secret end})
    :ok
  end

  test "instruct returns inside the port deadline while the API responds asynchronously" do
    assert {:ok, "instruction-1"} =
             Ports.call_port(AgentChannel, :instruct, [@target, "make the door red", "instruction-1", []], :instruct)

    assert_receive {:api_stub, "POST", "/internal/voice/instruct", [@internal_secret], body}, 1_000

    assert %{
             "target" => @target,
             "text" => "make the door red",
             "idempotency_key" => "instruction-1",
             "kind" => "instruct"
           } = Jason.decode!(body)
  end
end
