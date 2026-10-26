RIGOR MAINNET SOLO mining guide  v0.2

This is the Windows miner. It is not the wallet installer.
This is not a pool. There is no stratum+tcp:// address.
You fill in the RPC username, password, and rg1q payout address.

Do not use a TESTNET wallet, trg1q, 18760, or 18761.
Do not publish RPC port 8761. Do not mine on a project seed server.

================================================
Step 1  Start the mainnet wallet and find the data folder
================================================
1. Install the RIGOR v0.2 MAINNET wallet. Start rigor-wallet.exe.
2. The window title must not include [testnet].
3. rigor.conf belongs only in the wallet data folder:
   same folder as rigor-wallet.exe -> open data -> save rigor.conf there
   Correct: <wallet-install>\data\rigor.conf
   Wrong:   <wallet-install>\rigor.conf
   The wallet will not read a file saved next to rigor-wallet.exe.
4. If there is no data folder yet, start the wallet once. It creates the folder.
5. P2P is port 8760. RPC is 127.0.0.1:8761.

================================================
Step 2  Put the RPC username and password in that data folder
================================================
1. If <wallet-install>\data\rpc-auth.conf already exists, open it.
   Use its rpcuser and rpcpassword in Step 6.
   Do not invent a second password.
2. If that file does not exist, start Windows Notepad.
3. Do not open an existing .txt file. Use File -> New.
4. Paste these 5 lines. Change YOUR_NAME and YOUR_PASSWORD
   to values you choose. Do not leave CHANGE_ME:

server=1
rpcbind=127.0.0.1
rpcallowip=127.0.0.1
rpcuser=YOUR_NAME
rpcpassword=YOUR_PASSWORD

5. File -> Save.
6. Browse to <wallet-install>\data.
7. The file name must be:

   rigor.conf

8. Save as type must be:

   All Files

   Do not choose Text Documents.
   That creates rigor.conf.txt. The wallet will not read it.
9. After saving, confirm the name is rigor.conf, not rigor.conf.txt.
   If it is .txt, delete it and repeat this step.

================================================
Step 3  Fully quit the wallet
================================================
Do this as its own step. Do not skip it.

1. Close the Rigor Wallet window.
2. Check the system tray. If a Rigor icon is still there,
   right-click it -> Exit / Quit.
3. Open Task Manager and confirm there is no rigor-qt.exe,
   rigor-wallet.exe, or rigord.exe.
4. Only after the wallet has fully quit, go to Step 4.
   If it is still running, the new rigor.conf will not load.

================================================
Step 4  Start the wallet again
================================================
1. Start rigor-wallet.exe again.
2. Confirm the title does not include [testnet].
3. In Receive, addresses must start with rg1q.
4. Open Window -> Peers, or the Nodes tab, and wait until at least
   one peer is listed. A peer row is a real connection.
   A seed name in the Seed column is that connection's current DNS name.
   No row means that seed is not connected.
5. Wait until the wallet is past initial download before mining.
   If the node has no peer, it answers getblocktemplate with
   "is not connected". Wait. Do not set -solomining.

================================================
Step 5  Copy an rg1q receive address
================================================
In Receive, copy an address that starts with rg1q.
Do not use rg1p. That is a RES address, not a mining payout.
Do not use trg1q or rgrt1q.
Never type a private key or seed phrase into the miner.

The example rg1qYOURADDRESS below is not a valid address.
The miner rejects it. Replace it with the address you copied.

================================================
Step 6  Edit the miner script in Notepad
================================================
1. Extract rigor-v0.2-miner-windows-x86_64.zip to a simple folder,
   for example C:\RIGOR-miner.
2. Edit rigor-miner.cmd in Notepad.
   Do not double-click it to change the values. Double-clicking runs the miner.
   Right-click the file -> Edit
   or start Notepad first, then File -> Open and select this file.
3. Change only these lines so they match Step 2:

   RPC_USER
   RPC_PASS
   COINBASE_ADDR

   Set COINBASE_ADDR to the rg1q address from Step 5.
   You can instead leave COINBASE_ADDR and run:
   rigor-miner.cmd rg1q...
   Replace rg1q... with your address. The first argument is the payout.
4. Save.
5. Now double-click rigor-miner.cmd to run it.
   Do not double-click rigor-miner.exe.
6. Leave the console window open.

The script runs:

rigor-miner.exe -a rgrpow01 -q --no-getwork --coinbase-addr="YOUR_ADDRESS" -o "http://127.0.0.1:8761" -u "YOUR_RPC_USER" -p "YOUR_RPC_PASSWORD"

-a rgrpow01 is the MAINNET hash. --no-getwork keeps getwork off; SOLO uses
getblocktemplate. -q hides the per-thread hashmeter. It does not stop mining.
The script does not print the password.

Threads: you do not add -t. The miner leaves one logical processor for the
wallet, or two when the PC has 5 or more. Task Manager -> Performance -> CPU
shows Logical processors. To override, add this line above the start command
and save again. Example, 2 threads:

set MINER_THREADS=2

The script then runs with -t 2:

rigor-miner.exe -a rgrpow01 -q -t 2 --no-getwork --coinbase-addr="YOUR_ADDRESS" -o "http://127.0.0.1:8761" -u "YOUR_RPC_USER" -p "YOUR_RPC_PASSWORD"

Change 2 to the thread count you want. Do not type -t onto the start command.

================================================
What the window means
================================================
"Mining with N of M processors" means the miner started and reserved cores
for the wallet.
A status board about every 15 seconds means it is searching.
"Block found!" and "Confirmed by node" mean the node accepted a block.
An authorization or connection error means the wallet is not running, or
RPC_USER and RPC_PASS do not match the data folder.
"is not connected" means the wallet has no usable peer.
An invalid address line means the payout is not a MAINNET rg1q address.
rg1qYOURADDRESS and rg1qCHANGE_ME are rejected on purpose.

Stop the miner with Ctrl+C in that window.
The script then prints the exit code and waits.

================================================
If something fails
================================================
RPC connection refused
- Start rigor-wallet.exe and complete Step 3 and Step 4.

RPC authentication failed
- RPC_USER and RPC_PASS must be the values in
  <wallet-install>\data\rpc-auth.conf, or in rigor.conf if you created it.
- The file must be named rigor.conf, in the data folder, not rigor.conf.txt.
- Quit the wallet from the tray, then start it again.

No peers, or no work
- Wait until the Nodes tab lists a peer.
- Do not set -solomining. Do not point the miner at a public seed.
