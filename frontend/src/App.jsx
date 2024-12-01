import { useWallets } from "@privy-io/react-auth";
import "./App.css";

function App() {
  const { wallets } = useWallets();
  return (
    <>
      <div>app intialized</div>
      <p>Wallet address : {wallets[0].address}</p>
    </>
  );
}

export default App;
