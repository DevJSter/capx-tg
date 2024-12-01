import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import PrivyWalletProvider from "./context/PrivyProvider.jsx";
import UserAuthContext from "./context/UserAuthContext";
import { SDKProvider } from "@telegram-apps/sdk-react";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <SDKProvider acceptCustomStyles debug>
      <UserAuthContext>
        <PrivyWalletProvider>
          <App />
        </PrivyWalletProvider>
      </UserAuthContext>
    </SDKProvider>
  </StrictMode>
);
