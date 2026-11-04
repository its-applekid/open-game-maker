defmodule OgmVoice.DictationSocketTest do
  use ExUnit.Case, async: true

  alias OgmVoice.DictationSocket

  defmodule FakeTranscriber do
    def start(opts) do
      test = Keyword.fetch!(opts, :test)
      send(test, {:transcriber_started, Keyword.fetch!(opts, :owner)})
      Agent.start_link(fn -> test end)
    end

    def push(pid, audio), do: send(Agent.get(pid, & &1), {:transcriber_audio, audio})
    def commit(pid), do: send(Agent.get(pid, & &1), :transcriber_commit)
    def stop(pid), do: send(Agent.get(pid, & &1), :transcriber_stop)
  end

  setup do
    name = Module.concat(__MODULE__, "Lease#{System.unique_integer([:positive])}")
    start_supervised!({OgmVoice.DictationLeases, name: name})
    %{leases: name}
  end

  test "relays PCM and one commit, then forwards neutral transcript frames", %{leases: leases} do
    assert {:ok, state} =
             DictationSocket.init(%{
               nonce: "nonce-one",
               leases: leases,
               transcriber: FakeTranscriber,
               transcriber_opts: [test: self()],
               deadline_scheduler: fn delay -> send(self(), {:deadline_scheduled, delay}) end
             })

    assert_receive {:transcriber_started, owner}
    assert owner == self()
    assert_receive {:deadline_scheduled, 120_000}

    audio = Jason.encode!(%{v: 1, type: "audio", data_b64: "AA=="})
    assert {:ok, state} = DictationSocket.handle_in({audio, [opcode: :text]}, state)
    assert_receive {:transcriber_audio, "AA=="}

    commit = Jason.encode!(%{v: 1, type: "commit"})
    assert {:ok, state} = DictationSocket.handle_in({commit, [opcode: :text]}, state)
    assert {:ok, state} = DictationSocket.handle_in({commit, [opcode: :text]}, state)
    assert_receive :transcriber_commit
    refute_receive :transcriber_commit

    assert {:push, {:text, partial}, state} =
             DictationSocket.handle_info({:voice_transcript, :partial, "make the"}, state)

    assert Jason.decode!(partial) == %{"v" => 1, "type" => "transcript", "kind" => "partial", "text" => "make the"}

    assert {:push, {:text, final}, _state} =
             DictationSocket.handle_info({:voice_transcript, :final, "make the door"}, state)

    assert Jason.decode!(final) == %{
             "v" => 1,
             "type" => "transcript",
             "kind" => "final",
             "text" => "make the door"
           }
  end

  test "the server deadline stops the paid transcriber", %{leases: leases} do
    assert {:ok, state} =
             DictationSocket.init(%{
               nonce: "nonce-two",
               leases: leases,
               transcriber: FakeTranscriber,
               transcriber_opts: [test: self()],
               deadline_scheduler: fn _delay -> :ok end
             })

    assert_receive {:transcriber_started, _owner}
    assert {:push, {:text, error}, _state} = DictationSocket.handle_info(:dictation_deadline, state)
    assert_receive :transcriber_stop

    assert Jason.decode!(error) == %{
             "v" => 1,
             "type" => "error",
             "code" => "duration_limit",
             "message" => "Dictation reached its time limit."
           }
  end

  test "rejects invalid and oversized audio before the transcriber", %{leases: leases} do
    assert {:ok, state} =
             DictationSocket.init(%{
               nonce: "nonce-three",
               leases: leases,
               transcriber: FakeTranscriber,
               transcriber_opts: [test: self()],
               deadline_scheduler: fn _delay -> :ok end
             })

    assert_receive {:transcriber_started, _owner}
    invalid = Jason.encode!(%{v: 1, type: "audio", data_b64: "not base64"})
    assert {:push, {:text, error}, _state} = DictationSocket.handle_in({invalid, :text}, state)
    assert Jason.decode!(error)["code"] == "invalid_frame"
    refute_receive {:transcriber_audio, _audio}

    oversized = Jason.encode!(%{v: 1, type: "audio", data_b64: Base.encode64(:binary.copy(<<0>>, 64_001))})
    assert {:push, {:text, error}, _state} = DictationSocket.handle_in({oversized, :text}, state)
    assert Jason.decode!(error)["code"] == "invalid_frame"
    refute_receive {:transcriber_audio, _audio}
  end
end
