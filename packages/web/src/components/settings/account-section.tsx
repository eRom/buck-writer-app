interface Props {
  email: string;
}

export function AccountSection({ email }: Props) {
  return (
    <section className="rounded-xl border border-card-border bg-card p-6">
      <h2 className="text-lg font-semibold">Compte</h2>
      <p className="mt-1 text-sm text-muted-foreground">Gerez votre compte.</p>
      <div className="mt-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm">Email</div>
            <div className="text-xs text-muted-foreground">Utilise pour la connexion</div>
          </div>
          <div className="font-mono text-sm text-muted-foreground">{email}</div>
        </div>
      </div>
    </section>
  );
}
