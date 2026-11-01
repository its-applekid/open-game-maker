defmodule OgmVoice.TokenTest do
  # Vectors are minted by services/api/test/voice-token.test.ts; this proves the TS minter and the
  # package's HMAC verifier agree on the format, so a browser token from the API opens the socket.
  use ExUnit.Case, async: false

  alias VoiceConverse.Ports

  @fixture Path.expand("../fixtures/token_vectors.json", __DIR__)

  setup do
    %{"secret" => secret} = vectors = @fixture |> File.read!() |> Jason.decode!()
    OgmVoice.TokenIssuer.install(fn -> secret end)
    vectors
  end

  test "every vector verifies as the minting side expects", %{"vectors" => vectors, "verify_at" => at} do
    now = DateTime.from_unix!(at)
    assert length(vectors) == 4

    for %{"token" => token, "expect" => expected} = vector <- vectors do
      result = OgmVoice.TokenIssuer.verify(token, "converse", now: now)

      case expected do
        "ok" ->
          assert {:ok, %{scope: "converse", subject: sub, expires_at: exp, target: target}} = result
          assert sub == vector["sub"]
          assert target == vector["target"]
          assert DateTime.to_unix(exp) == vector["exp"]

        reason ->
          assert result == {:error, String.to_existing_atom(reason)}, "#{vector["name"]}: #{inspect(result)}"
      end
    end
  end

  test "the valid vector fails once its 300 s are up (expiry is exclusive)", %{"vectors" => vectors} do
    %{"token" => token, "exp" => exp} = Enum.find(vectors, &(&1["expect"] == "ok"))
    assert {:error, :expired} = OgmVoice.TokenIssuer.verify(token, "converse", now: DateTime.from_unix!(exp))
  end

  test "host-issued tokens bind the target too", %{"verify_at" => at} do
    target = %{"kind" => "build", "game_id" => "g1", "job_id" => "j1", "ticket" => "44", "creator_id" => "u1"}
    now = DateTime.from_unix!(at)
    assert {:ok, token, _expires_at} = OgmVoice.TokenIssuer.issue("converse", subject: "u1", target: target, now: now)
    assert {:ok, %{subject: "u1", target: ^target}} = OgmVoice.TokenIssuer.verify(token, "converse", now: now)
  end

  test "a secret that is unset or too short fails closed", %{"vectors" => [%{"token" => token} | _], "verify_at" => at} do
    OgmVoice.TokenIssuer.install(fn -> nil end)
    assert {:error, :invalid} = OgmVoice.TokenIssuer.verify(token, "converse", now: DateTime.from_unix!(at))
    OgmVoice.TokenIssuer.install(fn -> "short" end)
    assert {:error, :invalid} = OgmVoice.TokenIssuer.verify(token, "converse", now: DateTime.from_unix!(at))
  end

  test "verification answers inside the package's 50 ms token deadline", %{"vectors" => [%{"token" => token} | _]} do
    # `:expired`, not the `:unavailable` a missed deadline returns: the vector is from 2026-11-01 05:25 UTC.
    assert {:error, :expired} = Ports.call_port(OgmVoice.TokenIssuer, :verify, [token, "converse", []], :token)
  end
end
