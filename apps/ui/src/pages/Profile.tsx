import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { getProfile, updateProfile, changePassword } from "../api/auth";

interface ProfileData {
  id: number;
  username: string;
  role: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  profile_picture_url: string | null;
  created_at: string;
  updated_at: string | null;
}

export default function Profile() {
  const { refreshUser } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  // Profile form
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [pictureUrl, setPictureUrl] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileSuccess, setProfileSuccess] = useState("");

  // Password form
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState("");

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const res = await getProfile();
      const data = res.data as ProfileData;
      setProfile(data);
      setFirstName(data.first_name || "");
      setLastName(data.last_name || "");
      setEmail(data.email || "");
      setPictureUrl(data.profile_picture_url || "");
    } catch {
      setProfileError("Failed to load profile");
    } finally {
      setLoading(false);
    }
  };

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError("");
    setProfileSuccess("");
    setProfileSaving(true);

    // Client-side email validation
    if (email && !/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) {
      setProfileError("Invalid email format");
      setProfileSaving(false);
      return;
    }

    try {
      const payload: Record<string, string | null> = {};
      if (firstName !== (profile?.first_name || "")) payload.first_name = firstName || null;
      if (lastName !== (profile?.last_name || "")) payload.last_name = lastName || null;
      if (email !== (profile?.email || "")) payload.email = email || null;
      if (pictureUrl !== (profile?.profile_picture_url || ""))
        payload.profile_picture_url = pictureUrl || null;

      if (Object.keys(payload).length === 0) {
        setProfileError("No changes to save");
        setProfileSaving(false);
        return;
      }

      const res = await updateProfile(payload as Parameters<typeof updateProfile>[0]);
      const data = res.data as ProfileData;
      setProfile(data);
      setFirstName(data.first_name || "");
      setLastName(data.last_name || "");
      setEmail(data.email || "");
      setPictureUrl(data.profile_picture_url || "");
      setProfileSuccess("Profile updated successfully");
      await refreshUser();
      setTimeout(() => setProfileSuccess(""), 4000);
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { detail?: string | Array<{ msg: string }> } } };
      const detail = axErr.response?.data?.detail;
      if (Array.isArray(detail)) {
        setProfileError(detail.map((d) => d.msg).join(". "));
      } else {
        setProfileError((detail as string) || "Failed to update profile");
      }
    } finally {
      setProfileSaving(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError("");
    setPwSuccess("");

    if (newPassword !== confirmPassword) {
      setPwError("Passwords do not match");
      return;
    }
    if (newPassword.length < 8) {
      setPwError("Password must be at least 8 characters");
      return;
    }
    if (!/[A-Z]/.test(newPassword)) {
      setPwError("Password must contain at least one uppercase letter");
      return;
    }
    if (!/[a-z]/.test(newPassword)) {
      setPwError("Password must contain at least one lowercase letter");
      return;
    }
    if (!/\d/.test(newPassword)) {
      setPwError("Password must contain at least one digit");
      return;
    }

    setPwSaving(true);
    try {
      await changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setPwSuccess("Password changed successfully");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setPwSuccess(""), 4000);
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { detail?: string | Array<{ msg: string }> } } };
      const detail = axErr.response?.data?.detail;
      if (Array.isArray(detail)) {
        setPwError(detail.map((d) => d.msg).join(". "));
      } else {
        setPwError((detail as string) || "Failed to change password");
      }
    } finally {
      setPwSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400 dark:text-gray-500">
        Loading profile...
      </div>
    );
  }

  const initials = [
    profile?.first_name?.[0],
    profile?.last_name?.[0],
  ]
    .filter(Boolean)
    .join("")
    .toUpperCase() || profile?.username?.[0]?.toUpperCase() || "?";

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 text-gray-900 dark:text-gray-100">
        My Profile
      </h1>

      {/* Avatar & identity header */}
      <div className="bg-white dark:bg-gray-900 shadow dark:shadow-gray-900/50 rounded-xl p-6 mb-6 border border-transparent dark:border-gray-800">
        <div className="flex items-center gap-5">
          {profile?.profile_picture_url ? (
            <img
              src={profile.profile_picture_url}
              alt="Profile"
              className="w-16 h-16 rounded-full object-cover ring-2 ring-gray-200 dark:ring-gray-700"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center text-white text-xl font-bold ring-2 ring-blue-300 dark:ring-blue-800">
              {initials}
            </div>
          )}
          <div>
            <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {profile?.first_name || profile?.last_name
                ? `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim()
                : profile?.username}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              @{profile?.username}
            </p>
            <span className="inline-block mt-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs font-medium px-2 py-0.5 rounded">
              {profile?.role}
            </span>
          </div>
        </div>
        {profile?.created_at && (
          <p className="mt-4 text-xs text-gray-400 dark:text-gray-500">
            Member since {new Date(profile.created_at).toLocaleDateString()}
            {profile.updated_at && (
              <> · Last updated {new Date(profile.updated_at).toLocaleDateString()}</>
            )}
          </p>
        )}
      </div>

      {/* Profile edit form */}
      <div className="bg-white dark:bg-gray-900 shadow dark:shadow-gray-900/50 rounded-xl p-6 mb-6 border border-transparent dark:border-gray-800">
        <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">
          Edit Profile
        </h2>

        {profileError && (
          <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm px-4 py-3 rounded-lg mb-4">
            {profileError}
          </div>
        )}
        {profileSuccess && (
          <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 text-sm px-4 py-3 rounded-lg mb-4">
            {profileSuccess}
          </div>
        )}

        <form onSubmit={handleProfileSave} className="space-y-4">
          {/* Username — disabled */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Username
            </label>
            <input
              type="text"
              value={profile?.username || ""}
              disabled
              className="w-full border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-500 rounded-lg px-3 py-2 text-sm cursor-not-allowed"
            />
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              Username cannot be changed
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                First Name
              </label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Enter first name"
                className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none placeholder:text-gray-400 dark:placeholder:text-gray-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Last Name
              </label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Enter last name"
                className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none placeholder:text-gray-400 dark:placeholder:text-gray-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none placeholder:text-gray-400 dark:placeholder:text-gray-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Profile Picture URL
            </label>
            <input
              type="url"
              value={pictureUrl}
              onChange={(e) => setPictureUrl(e.target.value)}
              placeholder="https://example.com/avatar.jpg"
              className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none placeholder:text-gray-400 dark:placeholder:text-gray-500"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={profileSaving}
              className="bg-blue-600 text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {profileSaving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>

      {/* Change password form */}
      <div className="bg-white dark:bg-gray-900 shadow dark:shadow-gray-900/50 rounded-xl p-6 border border-transparent dark:border-gray-800">
        <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">
          Change Password
        </h2>

        {pwError && (
          <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm px-4 py-3 rounded-lg mb-4">
            {pwError}
          </div>
        )}
        {pwSuccess && (
          <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 text-sm px-4 py-3 rounded-lg mb-4">
            {pwSuccess}
          </div>
        )}

        <form onSubmit={handlePasswordChange} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Current Password
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none placeholder:text-gray-400 dark:placeholder:text-gray-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              New Password
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none placeholder:text-gray-400 dark:placeholder:text-gray-500"
            />
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              Min 8 characters, at least one uppercase, one lowercase, and one digit
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Confirm New Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none placeholder:text-gray-400 dark:placeholder:text-gray-500"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={pwSaving}
              className="bg-red-600 text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {pwSaving ? "Changing..." : "Change Password"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
