import { useContext } from "react";
import { useNavigate } from "react-router-dom";
import { GoogleLogin, type CredentialResponse } from '@react-oauth/google';
import { AuthContext } from "../../../providers/AuthContext.ts";
import { ROLES } from "../../../config/roles/roles.ts";
import { Paths } from "../../../config/paths/paths.ts";

const GoogleLoginTest = () => {
    const { googleLogin } = useContext(AuthContext)!;
    const navigate = useNavigate();


    const handleSuccess = async (credentialResponse: CredentialResponse) => {
        const idToken = credentialResponse.credential;

        if (!idToken) {
            console.error("No token received from Google");
            return;
        }

        try {
            const loggedInUser = await googleLogin(idToken);


            if (loggedInUser.role === ROLES.ADMIN) {
                navigate(Paths.ADMIN, { replace: true });
            } else if (loggedInUser.role === ROLES.OPERATOR) {
                navigate(Paths.OPERATOR, { replace: true });
            } else if (loggedInUser.role === ROLES.USER) {
                navigate(Paths.USER, { replace: true });
            } else {
                navigate(Paths.FORBIDDEN, { replace: true });
            }

        } catch (error) {
            console.error("Google Login Error:", error);
        }
    };

    return (
        <div style={{ display: 'flex', justifyContent: 'center' }}>

            <GoogleLogin
                onSuccess={handleSuccess}
                onError={() => {
                    console.error('Login Failed');
                }}
                theme="outline"
                size="large"
            />
        </div>
    );
};

export default GoogleLoginTest;