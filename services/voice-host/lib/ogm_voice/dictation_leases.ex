defmodule OgmVoice.DictationLeases do
  @moduledoc "Tracks dictate-token nonces so one signed token cannot open concurrent paid sessions."

  use GenServer

  def start_link(opts) do
    {name, opts} = Keyword.pop(opts, :name, __MODULE__)
    GenServer.start_link(__MODULE__, opts, name: name)
  end

  @spec claim(GenServer.server(), String.t(), pid()) :: :ok | {:error, :invalid | :replayed}
  def claim(server \\ __MODULE__, nonce, owner \\ self()),
    do: GenServer.call(server, {:claim, nonce, owner})

  @impl true
  def init(_opts), do: {:ok, %{}}

  @impl true
  def handle_call({:claim, nonce, owner}, _from, leases)
      when is_binary(nonce) and byte_size(nonce) in 1..128 and is_pid(owner) do
    case leases do
      %{^nonce => {^owner, _monitor}} ->
        {:reply, :ok, leases}

      %{^nonce => {_other, _monitor}} ->
        {:reply, {:error, :replayed}, leases}

      %{} ->
        monitor = Process.monitor(owner)
        {:reply, :ok, Map.put(leases, nonce, {owner, monitor})}
    end
  end

  def handle_call({:claim, _nonce, _owner}, _from, leases), do: {:reply, {:error, :invalid}, leases}

  @impl true
  def handle_info({:DOWN, monitor, :process, _pid, _reason}, leases) do
    {:noreply, Map.reject(leases, fn {_nonce, {_owner, lease_monitor}} -> lease_monitor == monitor end)}
  end

  def handle_info(_message, leases), do: {:noreply, leases}
end
