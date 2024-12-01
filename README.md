# CAPX Central Authentication Mechanism

This README provides a detailed walkthrough of the CAPX central authentication mechanism for mini app developers who wish to integrate their apps with the Capx Super App. The guide covers the frontend integration, sample code snippets, and an explanation of the authentication flow.

## Table of Contents

- [CAPX Central Authentication Mechanism](#capx-central-authentication-mechanism)
  - [Table of Contents](#table-of-contents)
  - [Introduction](#introduction)
  - [Entities](#entities)
  - [Authentication Flow](#authentication-flow)
  - [Frontend Setup](#frontend-setup)
    - [Dependencies](#dependencies)
    - [Configuration Files](#configuration-files)
      - [`main.jsx`](#mainjsx)
      - [`App.jsx`](#appjsx)
      - [`UserAuthContext.jsx`](#userauthcontextjsx)
      - [`PrivyProvider.jsx`](#privyproviderjsx)
  - [Detailed Walkthrough](#detailed-walkthrough)
    - [Step 1: Retrieve Telegram Init Data](#step-1-retrieve-telegram-init-data)
    - [Step 2: Validate Init Data on MAB](#step-2-validate-init-data-on-mab)
    - [Step 3: Authenticate with Super App Backend (SAB)](#step-3-authenticate-with-super-app-backend-sab)
    - [Step 4: Connect to Privy](#step-4-connect-to-privy)
    - [Step 5: Mint xID](#step-5-mint-xid)
  - [Conclusion](#conclusion)

## Introduction

The CAPX Central Authentication mechanism allows mini apps (clients) to securely authenticate users via the Capx Super App. By leveraging JWT-based authentication and Privy, mini apps can ensure seamless user authentication, wallet integration, and interaction with on-chain transactions like minting xID.


## Entities

- **MAF (Mini App Frontend):** The frontend interface of the mini app.
- **MAB (Mini App Backend):** The backend server of the mini app.
- **SAB (Super App Backend):** The central authentication server provided by Capx.

## Authentication Flow

1. **MAF retrieves init data from Telegram.**
2. **MAF sends the init data to MAB.**
3. **MAB validates the init data, appends `client_id`, generates a new hash using `client_secret`, and returns the modified init data to MAF.**
4. **MAF sends the modified init data to SAB.**
5. **SAB verifies the `client_id` and hash, and returns user details along with JWT access and refresh tokens.**
6. **MAF receives the tokens and sets them as cookies.**
7. **MAF connects to Privy using the access token.**
8. **MAF checks if the user needs to mint xID and initiates the minting process if necessary.**

**Note:** xID is an on-chain transaction. Privy is used on the frontend for Web3 connectivity.

## Frontend Setup

### Dependencies

Ensure your frontend has the following dependencies installed:

- **Privy:** For wallet integration and Web3 connectivity.
- **Telegram Apps SDK:** For interacting with Telegram init data.
- **Axios:** For making HTTP requests to your backend and the super app backend.
- **Ethers.js:** For interacting with Ethereum-based blockchains.
- **Cookies Library (`js-cookie`):** For handling cookies in the browser.

### Configuration Files

Below are the configuration files and context providers required for setting up the frontend.

#### `main.jsx`

```jsx
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
```

**Explanation:**

- Wraps the app with context providers for user authentication (`UserAuthContext`) and Privy wallet integration (`PrivyWalletProvider`).
- Includes the Telegram SDK provider for accessing `initDataRaw`.

#### `App.jsx`

```jsx
import { useWallets } from "@privy-io/react-auth";
import "./App.css";

function App() {
  const { wallets } = useWallets();
  return (
    <>
      <div>App Initialized</div>
      <p>Wallet Address: {wallets[0]?.address}</p>
    </>
  );
}

export default App;
```

**Explanation:**

- Displays the connected wallet address.
- Confirms that the app is initialized and the user is authenticated.

#### `UserAuthContext.jsx`

```jsx
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useLaunchParams } from "@telegram-apps/sdk-react";
import axios from "axios";
import Cookies from "js-cookie";
import api from "../api";
import { setTokenCookies } from "../utils";

const UserDetailsContext = createContext();

const UserAuthContext = ({ children }) => {
  const [userDetails, setUserDetails] = useState({});
  const [isUserCreated, setIsUserCreated] = useState(false);
  const [txDetails, setTxDetails] = useState({});

  const initDataRaw = useLaunchParams()?.initDataRaw;

  const createUser = useCallback(async (initData) => {
    const { data: userInfo } = await api.post(
      `/users/auth`,
      {},
      {
        headers: {
          "x-initdata": initData,
        },
      }
    );
    setTokenCookies(
      userInfo?.result.access_token,
      userInfo?.result.refresh_token
    );

    setUserDetails(userInfo?.result?.user);
    setIsUserCreated(true);
    setTxDetails(userInfo?.result?.signup_tx || {});
  }, []);

  const getUserDetails = useCallback(async () => {
    const { data: userInfo } = await api.get("/users");
    setUserDetails(userInfo?.result?.user);
    setIsUserCreated(true);
    setTxDetails(userInfo?.result?.signup_tx || {});
  }, []);

  useEffect(() => {
    (async () => {
      if (initDataRaw) {
        try {
          // Verify init data with MAB
          const { data } = await axios.post(
            `${import.meta.env.VITE_VERIFY_API_ENDPOINT}/verify`,
            {
              initData: initDataRaw,
            }
          );
          const refresh_token = Cookies.get("refresh_token");
          if (!refresh_token) {
            await createUser(data.initData);
          } else {
            await getUserDetails();
          }
        } catch (err) {
          console.log(err.message);
        }
      }
    })();
  }, [initDataRaw]);

  return (
    <UserDetailsContext.Provider
      value={{ userDetails, isUserCreated, txDetails, getUserDetails }}
    >
      {children}
    </UserDetailsContext.Provider>
  );
};

export default UserAuthContext;

export const useUserDetails = () => useContext(UserDetailsContext);
```

**Explanation:**

- Manages user authentication and state.
- Sends the `initDataRaw` to MAB for validation and modification.
- Receives the modified init data from MAB.
- Authenticates with SAB using the modified init data and retrieves JWT access and refresh tokens.
- Stores tokens as cookies.
- Provides user details and transaction details (`signup_tx`) for xID minting.

#### `PrivyProvider.jsx`

```jsx
"use client";
import { defineChain } from "viem";

import { useCallback, useEffect } from "react";
import { PrivyProvider, usePrivy, useWallets } from "@privy-io/react-auth";
import { useUserDetails } from "./UserAuthContext";
import { ethers } from "ethers";
import Cookies from "js-cookie";
import api from "../api";

const Capx = defineChain({
  id: Number(import.meta.env.VITE_PUBLIC_CAPX_CHAIN_ID),
  name: import.meta.env.VITE_PUBLIC_CAPX_CHAIN_NETWORK_NAME,
  network: import.meta.env.VITE_PUBLIC_CAPX_CHAIN_NETWORK_NAME,
  logoUrl: "https://internal.app.capx.fi/favicon.png",
  nativeCurrency: {
    decimals: 18,
    name: "ether",
    symbol: import.meta.env.VITE_PUBLIC_CAPX_CHAIN_CURRENCY,
  },
  rpcUrls: {
    default: {
      http: [import.meta.env.VITE_PUBLIC_CAPX_CHAIN_RPC_URL],
      webSocket: [import.meta.env.VITE_PUBLIC_CAPX_WEB_SOCKET_URL],
    },
    public: {
      http: [import.meta.env.VITE_PUBLIC_CAPX_CHAIN_RPC_URL],
      webSocket: [import.meta.env.VITE_PUBLIC_CAPX_WEB_SOCKET_URL],
    },
  },
  blockExplorers: {
    default: {
      name: "Explorer",
      url: import.meta.env.VITE_PUBLIC_CAPX_CHAIN_EXPLORE_URL,
    },
  },
});

const PrivyWrapper = ({ children }) => {
  const { txDetails, userDetails, getUserDetails } = useUserDetails();
  const { wallets } = useWallets();
  const { user, authenticated, createWallet } = usePrivy();

  const mintXId = async () => {
    const startTime = performance.now();
    if (Object.keys(txDetails).length > 0) {
      try {
        await api.post("/wallet/faucet");
      } catch (error) {
        console.log(error, "request faucet error");
      }
      try {
        const wallet = wallets.find(
          (wallet) => wallet.walletClientType === "privy"
        );
        await wallet.switchChain(import.meta.env.VITE_PUBLIC_CAPX_CHAIN_ID);
        let providerInstance = await wallet.getEthersProvider();
        const signer = providerInstance.getSigner();
        const contract = new ethers.Contract(
          txDetails.contract_address,
          txDetails.contract_abi,
          signer
        );
        const txResponse = await signer.sendTransaction({
          to: txDetails.contract_address,
          data: contract.interface.encodeFunctionData("createProfile", [
            txDetails.input_params._profileParams,
            txDetails.input_params._profileData,
          ]),
          chainId: 10245,
        });

        const receipt = await txResponse.wait();
        const endTime = performance.now();
        console.log(endTime - startTime, "XID transaction time");
        console.log(receipt, "Mint xID transaction receipt");
        await getUserDetails();
        return true;
      } catch (error) {
        console.log(error, "mint transaction error");
        return false;
      }
    }
  };

  useEffect(() => {
    let timer;
    (async () => {
      if (txDetails && userDetails?.version < 3 && wallets.length > 0) {
        const isMinted = await mintXId();
        if (!isMinted) {
          timer = setInterval(async () => {
            const isXIdMinted = await mintXId();
            if (isXIdMinted) {
              clearInterval(timer);
            }
          }, 300000); // Retry every 5 minutes
        }
      }
    })();

    return () => clearInterval(timer);
  }, [Object.keys(txDetails).length, wallets.length]);

  useEffect(() => {
    (async () => {
      if (authenticated) {
        if (!user?.wallet) {
          await createWallet();
        }
      }
    })();
  }, [authenticated]);
  return <>{wallets.length > 0 ? children : <p>Loading...</p>}</>;
};

export default function PrivyWalletProvider({ children }) {
  const { isUserCreated } = useUserDetails();

  const getCustomToken = useCallback(async () => {
    if (isUserCreated) {
      const idToken = Cookies.get("access_token");
      return idToken;
    } else {
      return null;
    }
  }, [isUserCreated]);

  return (
    <PrivyProvider
      appId={import.meta.env.VITE_PUBLIC_PRIVY_APP_ID}
      config={{
        supportedChains: [Capx],
        defaultChain: Capx,
        appearance: {
          theme: "dark",
          accentColor: "#676FFF",
          logo: "https://internal.app.capx.fi/favicon.png",
          showWalletLoginFirst: false,
        },
        customAuth: {
          isAuthReady: isUserCreated,
          getCustomAccessToken: getCustomToken,
        },
      }}
    >
      <PrivyWrapper>{children}</PrivyWrapper>
    </PrivyProvider>
  );
}
```

**Explanation:**

- Defines the CAPX blockchain network configuration using `viem`.
- Provides Privy authentication context.
- Uses the JWT access token (stored in cookies) as the custom access token for Privy.
- Handles xID minting logic if the user needs to mint xID.
- Manages wallet creation and ensures the user has a connected wallet.

## Detailed Walkthrough

### Step 1: Retrieve Telegram Init Data

- **MAF uses the Telegram SDK to get `initDataRaw`.**
- **Example:**

  ```javascript
  import { useLaunchParams } from "@telegram-apps/sdk-react";

  const initDataRaw = useLaunchParams()?.initDataRaw;
  ```

### Step 2: Validate Init Data on MAB

- **MAF sends `initDataRaw` to MAB.**
- **MAB validates the integrity of the init data from Telegram using the bot token.**
- **MAB appends `client_id`, generates a new hash using `client_secret`, and returns the modified init data to MAF.**

  **Note:** The `client_id` and `client_secret` are provided by the central auth (SAB).

- **Summary of MAB Actions:**

  - Validates the original `initData` using the bot token.
  - Appends `client_id` to the parameters.
  - Generates a new hash using `client_secret`.
  - Returns the modified init data (including `client_id` and new `hash`) to MAF.

- **Explanation:**

  - This step ensures that the init data is secure and that only authorized mini apps can interact with the SAB.
  - The MAB acts as a trusted intermediary to handle sensitive operations involving `client_secret`.

### Step 3: Authenticate with Super App Backend (SAB)

- **MAF sends the modified init data (received from MAB) directly to SAB.**
- **SAB verifies the `client_id` and the new `hash` generated using `client_secret`.**
- **SAB returns user details along with JWT access and refresh tokens.**

- **Code Snippet in `UserAuthContext.jsx`:**

  ```javascript
  const createUser = useCallback(async (initData) => {
    const { data: userInfo } = await api.post(
      `/users/auth`,
      {},
      {
        headers: {
          "x-initdata": initData,
        },
      }
    );
    setTokenCookies(
      userInfo?.result.access_token,
      userInfo?.result.refresh_token
    );

    setUserDetails(userInfo?.result?.user);
    setIsUserCreated(true);
    setTxDetails(userInfo?.result?.signup_tx || {});
  }, []);

  useEffect(() => {
    (async () => {
      if (initDataRaw) {
        try {
          // Verify init data with MAB
          const { data } = await axios.post(
            `${import.meta.env.VITE_VERIFY_API_ENDPOINT}/verify`,
            {
              initData: initDataRaw,
            }
          );
          const refresh_token = Cookies.get("refresh_token");
          if (!refresh_token) {
            // Use modified init data from MAB to authenticate with SAB
            await createUser(data.initData);
          } else {
            await getUserDetails();
          }
        } catch (err) {
          console.log(err.message);
        }
      }
    })();
  }, [initDataRaw]);
  ```

- **Explanation:**

  - Sends the original `initDataRaw` to MAB for validation and modification.
  - Receives the modified init data (with `client_id` and new `hash`) from MAB.
  - Sends the modified init data to SAB for authentication.
  - Stores the access and refresh tokens as cookies using `setTokenCookies`.
  - Sets user details and transaction details for xID minting.

### Step 4: Connect to Privy

- **After authentication, MAF connects to Privy using the JWT access token.**

- **Code Snippet in `PrivyProvider.jsx`:**

  ```javascript
  const getCustomToken = useCallback(async () => {
    if (isUserCreated) {
      const idToken = Cookies.get("access_token");
      return idToken;
    } else {
      return null;
    }
  }, [isUserCreated]);

  return (
    <PrivyProvider
      appId={import.meta.env.VITE_PUBLIC_PRIVY_APP_ID}
      config={{
        // ...
        customAuth: {
          isAuthReady: isUserCreated,
          getCustomAccessToken: getCustomToken,
        },
      }}
    >
      <PrivyWrapper>{children}</PrivyWrapper>
    </PrivyProvider>
  );
  ```

- **Explanation:**

  - Uses the `access_token` from cookies as the custom access token for Privy.
  - Ensures that Privy authentication only proceeds after the user is authenticated (`isUserCreated` is `true`).

### Step 5: Mint xID

- **MAF checks if the user needs to mint xID (e.g., `userDetails.version < 3`).**
- **If required, MAF initiates the minting process using the transaction details provided by SAB.**

- **Code Snippet in `PrivyProvider.jsx`:**

  ```javascript
  const mintXId = async () => {
    const startTime = performance.now();
    if (Object.keys(txDetails).length > 0) {
      try {
        await api.post("/wallet/faucet");
      } catch (error) {
        console.log(error, "request faucet error");
      }
      try {
        const wallet = wallets.find(
          (wallet) => wallet.walletClientType === "privy"
        );
        await wallet.switchChain(import.meta.env.VITE_PUBLIC_CAPX_CHAIN_ID);
        let providerInstance = await wallet.getEthersProvider();
        const signer = providerInstance.getSigner();
        const contract = new ethers.Contract(
          txDetails.contract_address,
          txDetails.contract_abi,
          signer
        );
        const txResponse = await signer.sendTransaction({
          to: txDetails.contract_address,
          data: contract.interface.encodeFunctionData("createProfile", [
            txDetails.input_params._profileParams,
            txDetails.input_params._profileData,
          ]),
          chainId: 10245,
        });

        const receipt = await txResponse.wait();
        const endTime = performance.now();
        console.log(endTime - startTime, "XID transaction time");
        console.log(receipt, "Mint xID transaction receipt");
        await getUserDetails();
        return true;
      } catch (error) {
        console.log(error, "mint transaction error");
        return false;
      }
    }
  };

  useEffect(() => {
    let timer;
    (async () => {
      if (txDetails && userDetails?.version < 3 && wallets.length > 0) {
        const isMinted = await mintXId();
        if (!isMinted) {
          timer = setInterval(async () => {
            const isXIdMinted = await mintXId();
            if (isXIdMinted) {
              clearInterval(timer);
            }
          }, 300000); // Retry every 5 minutes
        }
      }
    })();

    return () => clearInterval(timer);
  }, [Object.keys(txDetails).length, wallets.length]);
  ```

- **Explanation:**

  - Checks if `txDetails` are available and if the user needs to mint xID.
  - Attempts to mint xID by sending a transaction to the blockchain.
  - Handles retry logic if minting fails.
  - Updates user details after successful minting.

## Conclusion

By following this guide, mini app developers can integrate the CAPX central authentication mechanism into their apps. The process involves:

- Validating Telegram init data with the MAB.
- MAB appending `client_id`, generating a new `hash`, and returning the modified init data to MAF.
- MAF authenticating with the SAB using the modified init data.
- Using JWT tokens for authentication.
- Utilizing Privy for wallet connectivity.
- Handling on-chain transactions like minting xID.

**Key Takeaways:**

- **Simplified Authentication:** The SAB uses JWT and JWKS.
- **Direct Communication:** MAF sends the modified init data directly to SAB after receiving it from MAB.
- **Web3 Integration:** Uses Privy for wallet management and interacting with the CAPX blockchain.
- **Modular Codebase:** Utilizes context providers and modular configuration files for maintainability.
- **Compliance with Telegram:** Adheres to Telegram's mini app guidelines by properly handling init data.

**Next Steps:**

- Replace placeholder environment variables with actual values.
- Ensure all backend endpoints (`/verify`) are correctly implemented and accessible.
- Test the entire flow thoroughly in a development environment before deploying to production.
