import { ListChecks, Save } from "lucide-react";
import { saveServiceContent } from "@/app/actions";
import { AdminLayout } from "@/components/AdminLayout";
import { DeleteServiceContentForm } from "@/components/DeleteServiceContentForm";
import { requireRole } from "@/lib/auth";
import { getCachedAdminServiceContents } from "@/lib/cached-data";

export default async function AdminMastersPage() {
  const profile = await requireRole("admin");
  const contents = await getCachedAdminServiceContents();

  return (
    <AdminLayout displayName={profile.display_name}>
      <section className="admin-hero">
        <div>
          <p className="admin-eyebrow">マスタ管理</p>
          <h1>作業内容マスタ</h1>
          <p>予定登録と実績報告で使用する作業内容を管理します。</p>
        </div>
      </section>

      <section className="admin-section">
        <div className="admin-section-heading">
          <div><ListChecks size={19} /><span><h2>作業内容</h2><p>有効な項目だけスタッフ画面に表示</p></span></div>
          <strong>{contents.filter((item) => item.active).length}件</strong>
        </div>
        <form action={saveServiceContent} className="master-create-form">
          <label><span>作業内容名</span><input name="name" required /></label>
          <button className="button" type="submit">作業内容を追加</button>
        </form>
        <div className="admin-table-wrap">
          <table className="admin-table master-table">
            <thead><tr><th>作業内容名</th><th>状態</th><th>操作</th></tr></thead>
            <tbody>
              {contents.map((content) => (
                <tr key={content.id}>
                  <td>
                    <form action={saveServiceContent} className="inline-edit-form">
                      <input name="content_id" type="hidden" value={content.id} />
                      <input defaultValue={content.name} name="name" required />
                      <select defaultValue={content.active ? "true" : "false"} name="active">
                        <option value="true">有効</option>
                        <option value="false">無効</option>
                      </select>
                      <button aria-label={`${content.name}を保存`} className="table-icon-button save" type="submit">
                        <Save size={15} />
                      </button>
                    </form>
                  </td>
                  <td><span className={content.active ? "status green" : "status red"}>{content.active ? "有効" : "無効"}</span></td>
                  <td><DeleteServiceContentForm contentId={content.id} contentName={content.name} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AdminLayout>
  );
}
