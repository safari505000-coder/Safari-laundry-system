import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { LockKeyhole } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { ApiError } from '@/lib/api';
import { Button } from '@/modules/shared/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/modules/shared/components/ui/card';
import { Input } from '@/modules/shared/components/ui/input';
import { Label } from '@/modules/shared/components/ui/label';

export function ForceChangePasswordPage() {
  const navigate = useNavigate();
  const { token, user, sessionKind, changePassword, logout } = useAuth();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }
  if (sessionKind !== 'password-change') {
    return <Navigate to="/" replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast.error('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('تأكيد كلمة المرور غير مطابق');
      return;
    }
    setSaving(true);
    try {
      const me = await changePassword(oldPassword, newPassword);
      toast.success('تم تغيير كلمة المرور بنجاح');
      navigate(me.safariRole === 'DRIVER' ? '/pos' : '/', { replace: true });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'تعذر تغيير كلمة المرور');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-slate-950 px-4 py-10 text-slate-100 [font-family:'Tajawal',sans-serif]">
      <Card className="w-full max-w-md border-white/10 bg-white text-slate-950 shadow-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <LockKeyhole className="h-5 w-5" />
            تغيير كلمة المرور مطلوب
          </CardTitle>
          <CardDescription>
            تم تعيين كلمة مرور مؤقتة لحساب {user.fullName}. يجب تغييرها قبل دخول النظام.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="oldPassword">كلمة المرور الحالية</Label>
              <Input
                id="oldPassword"
                type="password"
                autoComplete="current-password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">كلمة المرور الجديدة</Label>
              <Input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={6}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">تأكيد كلمة المرور الجديدة</Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={6}
                required
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={saving}
                className="flex-1 bg-slate-900 text-white hover:bg-slate-800"
              >
                {saving ? 'جارٍ الحفظ...' : 'تغيير كلمة المرور'}
              </Button>
              <Button type="button" variant="outline" onClick={logout}>
                خروج
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
