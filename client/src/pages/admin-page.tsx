import { useQuery } from "@tanstack/react-query";
import { apiUrl } from "../lib/api-config";

type User = {
  id: number;
  username: string;
  role: string;
};

export default function AdminPage() {
  const { data, isLoading, error } = useQuery<User[]>({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/admin/users"), {
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error("Failed to fetch users");
      }

      return res.json();
    },
  });

  if (isLoading) {
    return <div className="p-4">Loading...</div>;
  }

  if (error) {
    return <div className="p-4 text-red-500">Error loading users</div>;
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Admin Users</h1>

      <div className="space-y-2">
        {(data ?? []).map((user) => (
          <div
            key={user.id}
            className="p-3 border rounded-lg flex justify-between"
          >
            <span>{user.username}</span>
            <span className="text-gray-500">{user.role}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
