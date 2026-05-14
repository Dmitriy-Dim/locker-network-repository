import { Routes, Route, Navigate } from "react-router-dom";
import { HomePage } from "../modules/shared/pages/HomePage.tsx";
import { LoginPage } from "../modules/auth/pages/LoginPage.tsx";
import { RegisterPage } from "../modules/auth/pages/RegisterPage.tsx";
import { ForbiddenPage } from "../modules/shared/pages/ForbiddenPage.tsx";
import { ProtectedRoute } from "../modules/shared/components/ProtectedRoute.tsx";
import { RoleGuard } from "../modules/shared/components/RoleGuard.tsx";
import { ROLES } from "../config/roles/roles.ts";

// LAYOUTS
import { Layout } from "../layout/Layout.tsx";
import DashboardLayout from "../layout/DashboardLayout.tsx";

// PAGES
import { Location } from "../modules/shared/pages/Location.tsx";
import StationDetailsPage from "../modules/admin/pages/StationDetailsPage.tsx";
import { AdminDashboardPage } from "../modules/admin/pages/AdminDashboardPage.tsx";
// USER PAGES
import UserDashboardPage from "../modules/user/pages/UserDashboardPage.tsx";
import MyBookingsPage from "../modules/user/pages/MyBookingsPage.tsx";
import { StationDetailsPage as UserStationDetailsPage } from "../modules/user/pages/StationDetailsPage.tsx";
import { PaymentSuccess } from "../modules/user/pages/PaymentSuccess.tsx";
import { PaymentCancel } from "../modules/user/pages/PaymentCancel.tsx";

import { Info } from "../modules/shared/pages/Info.tsx";
import { Price } from "../modules/shared/pages/Price.tsx";
import { Paths } from "../config/paths/paths.ts";

// OPERATOR PAGES
import OperatorDashboardPage from "../modules/operator/pages/OperatorDashboardPage.tsx";
import OperatorStationsPage from "../modules/operator/pages/OperatorStationsPage.tsx";
import OperatorStationDetailsPage from "../modules/operator/pages/OperatorStationDetailsPage.tsx";

// ADMIN PAGES
import AdminUsersTables from "../modules/admin/pages/AdminUsersTables";

import { PricingDashboard } from "../modules/admin/pages/PricingDashboard";
import AdminAlertsPage from "../modules/admin/pages/AdminAlertsPage";
import AdminUsersPage from "../modules/admin/pages/AdminUsersPage";

export function AppRoutes() {
    return (
        <Routes>
            {/* ================= PUBLIC GROUP ================= */}
            <Route element={<Layout />}>
                <Route path="/" element={<HomePage />} />
                <Route path="/location" element={<Location />} />
                <Route path="/price" element={<Price />} />
                <Route path="/info" element={<Info />} />
            </Route>

            {/* ================= AUTH ================= */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/403" element={<ForbiddenPage />} />

            <Route
                path="/payment/success"
                element={
                    <PaymentSuccess />
                }
            />
            <Route
                path="/payment/cancel"
                element={
                    <ProtectedRoute>
                        <PaymentCancel />
                    </ProtectedRoute>
                }
            />

            {/* ================= ADMIN ================= */}
            <Route
                path="/admin"
                element={
                    <ProtectedRoute>
                        <RoleGuard allowed={[ROLES.ADMIN]}>
                            <DashboardLayout />
                        </RoleGuard>
                    </ProtectedRoute>
                }
            >
                <Route index element={<AdminDashboardPage />} />
                <Route path="users" element={<AdminUsersTables />} />
                <Route path="/admin/users" element={<AdminUsersPage />} />
                <Route path="stations/:stationId" element={<StationDetailsPage />} />
                <Route path="pricing" element={<PricingDashboard />} />
                <Route path="alerts/cloudwatch" element={<AdminAlertsPage />} />
            </Route>

            {/* ================= OPERATOR ================= */}
            <Route
                path={Paths.OPERATOR}
                element={
                    <ProtectedRoute>
                        <RoleGuard allowed={[ROLES.OPERATOR]}>
                            <DashboardLayout />
                        </RoleGuard>
                    </ProtectedRoute>
                }
            >
                <Route index element={<OperatorDashboardPage />} />
                <Route path="stations" element={<OperatorStationsPage />} />
                <Route path="stations/:stationId" element={<OperatorStationDetailsPage />} />
                <Route path="alerts" element={<AdminAlertsPage />} />
            </Route>

            {/* ================= USER ================= */}
            <Route
                path="/user"
                element={
                    <ProtectedRoute>
                        <RoleGuard allowed={[ROLES.USER]}>
                            <DashboardLayout />
                        </RoleGuard>
                    </ProtectedRoute>
                }
            >
                <Route index element={<UserDashboardPage />} />
                <Route path="my-bookings" element={<MyBookingsPage />} />
                <Route path="stations/:id" element={<UserStationDetailsPage />} />

                <Route path="*" element={<Navigate to={Paths.USER} />} />
            </Route>


            <Route path="*" element={<Navigate to={Paths.HOME} />} />
        </Routes>
    );
}