import type {ReactNode} from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../../hooks/useAuth";
import {Paths} from "../../../config/paths/paths";

type Props = {
    children: ReactNode;
};

export function ProtectedRoute({ children }: Props): JSX.Element | null {
    const { user,loading } = useAuth();

    if (loading) {
        return null
    }

    if (!user) {
        return <Navigate to={Paths.LOGIN} />;
    }


    return <>{children}</>;
}
