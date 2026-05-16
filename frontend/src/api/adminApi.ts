import {apiClient} from "./apiClient.ts";
import type {User} from "../types/user/user.ts";
import type {AxiosResponse} from "axios";


export const getUsers = async ():Promise<User[]>  => {
    const response:AxiosResponse<User[]> = await apiClient.get("/admin/users?includeDeleted=true")
    return response.data;
}

export const updateRole = async (user:User):Promise<User> => {
    const response = await apiClient.patch(`/admin/users/${user.userId}`, {"role": user.role})
    const data = response.data;
    if (data.id && !data.userId) {
        data.userId = data.id;
    }
    return data;
};
