import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { User, Role } from '../types';
import { ROLES } from '../types';
import { usersAPI, authAPI } from '../lib/api';
import { roleBadgeClass, clsx, formatDate } from '../lib/utils';
import { UserPlus, Trash2, Edit2, Key, X, Check, Shield, Users, Pencil } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';

const createSchema = z.object({
  name:     z.string().min(2, 'Name must be at least 2 characters'),
  email:    z.string().email('Invalid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role:     z.string() as z.ZodType<Role>,
});
type CreateForm = z.infer<typeof createSchema>;

const pwSchema = z.object({ password: z.string().min(6, 'Min 6 characters') });
type PwForm = z.infer<typeof pwSchema>;

const editSchema = z.object({
  name:  z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email'),
  role:  z.string() as z.ZodType<Role>,
});
type EditForm = z.infer<typeof editSchema>;

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface-900/50 backdrop-blur-sm animate-fade-in">
      <div className="card p-6 w-full max-w-md space-y-5 animate-fade-in">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-surface-900 dark:text-white">{title}</h2>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: (u: User) => void }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { role: 'user' },
  });

  const onSubmit = async (data: CreateForm) => {
    try {
      const res = await authAPI.register(data);
      onCreated(res.data.user);
      toast.success('User created successfully!');
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to create user');
    }
  };

  return (
    <Modal title="Create New User" onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" autoComplete="off">
        <div>
          <label className="label">Full Name</label>
          <input {...register('name')} autoComplete="off" className={`input ${errors.name ? 'input-error' : ''}`} placeholder="Jane Doe" />
          {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>}
        </div>
        <div>
          <label className="label">Email</label>
          <input {...register('email')} type="email" autoComplete="off" className={`input ${errors.email ? 'input-error' : ''}`} placeholder="jane@company.com" />
          {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email.message}</p>}
        </div>
        <div>
          <label className="label">Password</label>
          <input {...register('password')} type="password" autoComplete="new-password" className={`input ${errors.password ? 'input-error' : ''}`} placeholder="••••••••" />
          {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password.message}</p>}
        </div>
        <div>
          <label className="label">Role</label>
          <select {...register('role')} className="select">
            {ROLES.map(r => <option key={r} value={r} className="capitalize">{r}</option>)}
          </select>
        </div>
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button type="submit" disabled={isSubmitting} className="btn-primary flex-1">
            {isSubmitting ? 'Creating…' : 'Create User'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EditUserModal({ user, currentUserId, onClose, onUpdated }: { user: User; currentUserId?: string; onClose: () => void; onUpdated: (u: User) => void }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<EditForm>({
    resolver: zodResolver(editSchema),
    defaultValues: { name: user.name, email: user.email, role: user.role },
  });

  const onSubmit = async (data: EditForm) => {
    try {
      const res = await usersAPI.update(user.id, data);
      onUpdated(res.data);
      toast.success('User updated successfully!');
      onClose();
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'Failed to update user';
      toast.error(msg);
    }
  };

  return (
    <Modal title={`Edit User — ${user.name}`} onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="label">Full Name</label>
          <input {...register('name')} className={`input ${errors.name ? 'input-error' : ''}`} />
          {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>}
        </div>
        <div>
          <label className="label">Email</label>
          <input {...register('email')} type="email" className={`input ${errors.email ? 'input-error' : ''}`} />
          {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email.message}</p>}
        </div>
        <div>
          <label className="label">Role</label>
          <select {...register('role')} className="select" disabled={user.id === currentUserId}>
            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          {user.id === currentUserId && <p className="text-xs text-surface-400 mt-1">You cannot change your own role</p>}
        </div>
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button type="submit" disabled={isSubmitting} className="btn-primary flex-1">
            {isSubmitting ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ResetPasswordModal({ user, onClose }: { user: User; onClose: () => void }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<PwForm>({
    resolver: zodResolver(pwSchema),
  });

  const onSubmit = async (data: PwForm) => {
    try {
      await usersAPI.resetPassword(user.id, data.password);
      toast.success('Password reset successfully!');
      onClose();
    } catch {
      toast.error('Failed to reset password');
    }
  };

  return (
    <Modal title={`Reset Password — ${user.name}`} onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="label">New Password</label>
          <input {...register('password')} type="password" className={`input ${errors.password ? 'input-error' : ''}`} placeholder="Min 6 characters" />
          {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password.message}</p>}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button type="submit" disabled={isSubmitting} className="btn-warning flex-1">
            {isSubmitting ? 'Resetting…' : 'Reset Password'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createKey, setCreateKey]   = useState(0);
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [editTarget, setEditTarget]   = useState<User | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRole, setEditRole]   = useState<Role>('user');

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await usersAPI.getAll();
      setUsers(res.data);
    } catch {
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleDelete = async (id: string) => {
    if (id === currentUser?.id) return toast.error("You can't delete your own account");
    if (!confirm('Delete this user permanently?')) return;
    try {
      await usersAPI.delete(id);
      setUsers(u => u.filter(x => x.id !== id));
      toast.success('User deleted');
    } catch {
      toast.error('Failed to delete user');
    }
  };

  const startEditRole = (u: User) => {
    setEditingId(u.id);
    setEditRole(u.role);
  };

  const saveRole = async (u: User) => {
    try {
      await usersAPI.update(u.id, { role: editRole });
      setUsers(us => us.map(x => x.id === u.id ? { ...x, role: editRole } : x));
      toast.success('Role updated');
    } catch {
      toast.error('Failed to update role');
    } finally {
      setEditingId(null);
    }
  };

  const roleCounts = ROLES.reduce((acc, r) => ({ ...acc, [r]: users.filter(u => u.role === r).length }), {} as Record<Role, number>);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-white">User Management</h1>
          <p className="text-sm text-surface-500 dark:text-surface-400 mt-0.5">{users.length} registered users</p>
        </div>
        <button onClick={() => { setCreateKey(k => k + 1); setShowCreate(true); }} className="btn-primary">
          <UserPlus size={16} /> New User
        </button>
      </div>

      {/* Role summary */}
      <div className="grid grid-cols-3 gap-4">
        {ROLES.map(role => (
          <div key={role} className="card p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center">
              <Shield size={16} className="text-brand-600 dark:text-brand-400" />
            </div>
            <div>
              <p className="text-xl font-bold text-surface-900 dark:text-white">{roleCounts[role] ?? 0}</p>
              <p className="text-xs text-surface-500 dark:text-surface-400 capitalize">{role}s</p>
            </div>
          </div>
        ))}
      </div>

      {/* Users Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="table-base min-w-[600px]">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 5 }).map((_, j) => (
                      <td key={j}><div className="h-4 bg-surface-100 dark:bg-surface-700 rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : users.map(u => (
                <tr key={u.id}>
                  <td>
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shrink-0">
                        <span className="text-white text-xs font-bold">{u.name[0].toUpperCase()}</span>
                      </div>
                      <span className="font-semibold text-surface-800 dark:text-surface-200">
                        {u.name}
                        {u.id === currentUser?.id && <span className="ml-1.5 text-[10px] text-brand-500 font-normal">(you)</span>}
                      </span>
                    </div>
                  </td>
                  <td className="text-xs font-mono text-surface-500">{u.email}</td>
                  <td>
                    {editingId === u.id ? (
                      <div className="flex items-center gap-1">
                        <select
                          value={editRole}
                          onChange={e => setEditRole(e.target.value as Role)}
                          className="select !py-1 !px-2 text-xs w-28"
                        >
                          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                        <button onClick={() => saveRole(u)} className="btn-ghost p-1 text-green-600"><Check size={14} /></button>
                        <button onClick={() => setEditingId(null)} className="btn-ghost p-1 text-red-500"><X size={14} /></button>
                      </div>
                    ) : (
                      <span className={roleBadgeClass(u.role)}>{u.role}</span>
                    )}
                  </td>
                  <td className="text-xs text-surface-500">{formatDate(u.created_at)}</td>
                  <td>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setEditTarget(u)} className="btn-ghost p-1.5 text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20" title="Edit user">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => startEditRole(u)} className="btn-ghost p-1.5" title="Change role">
                        <Shield size={13} />
                      </button>
                      <button onClick={() => setResetTarget(u)} className="btn-ghost p-1.5 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20" title="Reset password">
                        <Key size={13} />
                      </button>
                      <button onClick={() => handleDelete(u.id)} className="btn-ghost p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20" title="Delete user">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showCreate && (
        <CreateUserModal key={createKey} onClose={() => setShowCreate(false)} onCreated={u => setUsers(us => [...us, u])} />
      )}
      {resetTarget && (
        <ResetPasswordModal user={resetTarget} onClose={() => setResetTarget(null)} />
      )}
      {editTarget && (
        <EditUserModal
          user={editTarget}
          currentUserId={currentUser?.id}
          onClose={() => setEditTarget(null)}
          onUpdated={(updated) => setUsers(us => us.map(x => x.id === updated.id ? updated : x))}
        />
      )}
    </div>
  );
}
