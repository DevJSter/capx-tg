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
