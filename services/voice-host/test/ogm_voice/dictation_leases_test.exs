defmodule OgmVoice.DictationLeasesTest do
  use ExUnit.Case, async: true

  test "one live owner may use a token nonce and owner exit releases it" do
    name = Module.concat(__MODULE__, "Lease#{System.unique_integer([:positive])}")
    start_supervised!({OgmVoice.DictationLeases, name: name})
    first = spawn(fn -> Process.sleep(:infinity) end)
    second = spawn(fn -> Process.sleep(:infinity) end)

    assert :ok = OgmVoice.DictationLeases.claim(name, "one-nonce", first)
    assert {:error, :replayed} = OgmVoice.DictationLeases.claim(name, "one-nonce", second)

    Process.exit(first, :kill)
    assert eventually(fn -> OgmVoice.DictationLeases.claim(name, "one-nonce", second) == :ok end)
  end

  defp eventually(predicate, attempts \\ 20)
  defp eventually(predicate, 0), do: predicate.()

  defp eventually(predicate, attempts) do
    if predicate.() do
      true
    else
      Process.sleep(5)
      eventually(predicate, attempts - 1)
    end
  end
end
