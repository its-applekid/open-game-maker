defmodule OgmVoice.ConfigTest do
  use ExUnit.Case, async: false

  alias OgmVoice.Config

  @env %{
    "OGM_VOICE_TOKEN_SECRET" => String.duplicate("t", 32),
    "OGM_VOICE_INTERNAL_SECRET" => String.duplicate("i", 32),
    "OGM_API_INTERNAL_URL" => "http://127.0.0.1:4300",
    "OGM_VOICE_RENDER_DIR" => "/tmp/ogm-voice-test-renders"
  }

  test "defaults to the fake provider on the fixed loopback ports" do
    config = Config.from_env!(@env)

    assert %Config{
             provider: "fake",
             port: 40400,
             internal_port: 40401,
             max_sessions: 2,
             llm: "fake",
             render_dir: "/tmp/ogm-voice-test-renders"
           } = config

    assert [
             render_dir: "/tmp/ogm-voice-test-renders",
             provider: VoiceConverse.Testing.FakeProvider,
             provider_id: :fake,
             credentials: OgmVoice.Ports.Credentials,
             privacy: %{
               provider_allowlist: [:elevenlabs_agents, :openai_realtime, :fake],
               required_provider_options: %{elevenlabs_agents: %{record_voice: false}}
             }
           ] = Config.narration(config)
  end

  test "boots from the env file ogm-env-init writes, where every non-secret name is blank" do
    names =
      ~w(OGM_VOICE_PROVIDER OGM_VOICE_LLM OGM_VOICE_PORT OGM_VOICE_INTERNAL_PORT OGM_VOICE_MAX_SESSIONS)

    blank = Map.new(names, &{&1, ""})
    config = Config.from_env!(Map.merge(@env, blank))
    assert %Config{provider: "fake", port: 40400, internal_port: 40401, max_sessions: 2, llm: "fake"} = config
  end

  test "builds an instance config the package accepts and can start sessions with, storing no transcript" do
    {:ok, vc} = VoiceConverse.Config.new(Config.voice_converse(Config.from_env!(@env)))

    assert vc.transcript == :none and vc.transcript_root == nil
    assert {VoiceConverse.Testing.FakeProvider, _script} = vc.provider
    assert vc.privacy.required_provider_options == %{elevenlabs_agents: %{record_voice: false}}
    assert "propose_instruction" in vc.allowed_tools
    assert vc.limits.briefing_token_budget == 2_500
    assert VoiceConverse.availability(vc) == :ok
  end

  test "switches to a live adapter by env, which then needs a model" do
    env = Map.merge(@env, %{"OGM_VOICE_PROVIDER" => "elevenlabs_agents", "OGM_VOICE_LLM" => "gpt-4o-mini"})
    {:ok, vc} = VoiceConverse.Config.new(Config.voice_converse(Config.from_env!(env)))
    assert vc.provider == {VoiceConverse.Providers.ElevenLabsAgents, []}

    assert_raise Config.Error, ~r/OGM_VOICE_LLM is missing/, fn ->
      Config.from_env!(Map.put(@env, "OGM_VOICE_PROVIDER", "openai_realtime"))
    end
  end

  test "refuses to boot without a strong token secret, naming the variable and never the value" do
    weak = String.duplicate("w", 31)
    error = assert_raise Config.Error, fn -> Config.from_env!(Map.put(@env, "OGM_VOICE_TOKEN_SECRET", weak)) end
    assert Exception.message(error) =~ "OGM_VOICE_TOKEN_SECRET is shorter than 32 bytes"
    refute Exception.message(error) =~ weak

    assert_raise Config.Error, ~r/OGM_VOICE_TOKEN_SECRET is missing/, fn ->
      Config.from_env!(Map.delete(@env, "OGM_VOICE_TOKEN_SECRET"))
    end

    assert_raise Config.Error, ~r/OGM_VOICE_INTERNAL_SECRET/, fn ->
      Config.from_env!(Map.delete(@env, "OGM_VOICE_INTERNAL_SECRET"))
    end
  end

  test "names a bad provider, port, session cap or API URL" do
    for {name, value} <- [
          {"OGM_VOICE_PROVIDER", "gemini_live"},
          {"OGM_VOICE_PORT", "70000"},
          {"OGM_VOICE_MAX_SESSIONS", "0"},
          {"OGM_VOICE_RENDER_DIR", "relative/path"},
          {"OGM_API_INTERNAL_URL", "not a url"}
        ] do
      assert_raise Config.Error, ~r/#{name}/, fn -> Config.from_env!(Map.put(@env, name, value)) end
    end
  end

  test "provider keys are read at use time and only for their provider" do
    assert {:ok, "fake"} = OgmVoice.Ports.Credentials.fetch(:fake, :connect)
    previous = System.get_env("OPENAI_API_KEY")
    on_exit(fn -> restore_env("OPENAI_API_KEY", previous) end)
    System.delete_env("OPENAI_API_KEY")
    assert {:error, :missing} = OgmVoice.Ports.Credentials.fetch(:openai_realtime, :connect)
    assert {:error, :missing} = OgmVoice.Ports.Credentials.fetch(:gemini_live, :connect)
  end

  defp restore_env(name, nil), do: System.delete_env(name)
  defp restore_env(name, value), do: System.put_env(name, value)
end
