import { signOut } from "@/app/actions";

export function LogoutButton() {
  return (
    <form action={signOut}>
      <button className="button secondary" type="submit">
        ログアウト
      </button>
    </form>
  );
}
