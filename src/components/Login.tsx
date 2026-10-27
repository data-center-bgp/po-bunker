import { useState, type FormEvent } from "react";
import { useAuth } from "@/contexts/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Aurora from "@/components/reactbits/Aurora";
import BlurText from "@/components/reactbits/BlurText";
import SpotlightCard from "@/components/reactbits/SpotlightCard";
import {
  AlertCircle,
  ArrowRight,
  Eye,
  EyeOff,
  FileCheck2,
  FileText,
  Loader2,
  Lock,
  Mail,
  Undo2,
} from "lucide-react";

interface LoginFormData {
  email: string;
  password: string;
}

interface FormErrors {
  email?: string;
  password?: string;
  /** Rejected by the server (wrong credentials, no access, no connection). */
  form?: string;
}

const steps = [
  {
    icon: FileText,
    title: "Ajukan",
    description:
      "PO bunker BBM atau air tawar untuk kapal, dengan nomor PO otomatis per perusahaan dan bulan.",
  },
  {
    icon: FileCheck2,
    title: "Selesaikan",
    description:
      "Unggah Delivery Order dan catat kuantitas aktual di samping kuantitas yang dipesan.",
  },
  {
    icon: Undo2,
    title: "Batalkan",
    description:
      "PO yang salah dibatalkan dengan alasan, lalu disalin menjadi PO baru. Unduh PDF atau Excel kapan saja.",
  },
];

// Dark, fixed palette: the login screen is the one place that does not follow
// the app theme tokens.
const fieldClass =
  "h-11 border-white/10 bg-white/5 text-white placeholder:text-white/35 focus-visible:border-amber-400/60 focus-visible:ring-amber-400/30 [&:-webkit-autofill]:[-webkit-text-fill-color:white] [&:-webkit-autofill]:shadow-[inset_0_0_0_1000px_#17181d]";

const Login = () => {
  const { login } = useAuth();
  const [formData, setFormData] = useState<LoginFormData>({
    email: "",
    password: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.email.trim()) {
      newErrors.email = "Email wajib diisi";
    } else if (!validateEmail(formData.email)) {
      newErrors.email = "Masukkan alamat email yang valid";
    }

    if (!formData.password) {
      newErrors.password = "Kata sandi wajib diisi";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    if (errors[name as keyof FormErrors] || errors.form) {
      setErrors((prev) => ({
        ...prev,
        [name]: undefined,
        form: undefined,
      }));
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsLoading(true);
    setErrors({});

    try {
      await login(formData.email, formData.password);
    } catch (error) {
      console.error("Login error:", error);
      setErrors({
        form:
          error instanceof Error ? error.message : "Email atau kata sandi salah",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#07080b] text-white">
      {/* Background: aurora, faint grid, vignette */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <Aurora
          colorStops={["#d97706", "#fbbf24", "#c2410c"]}
          amplitude={1}
          blend={0.7}
          speed={0.5}
          height={0.55}
          glow={0.6}
          brightness={0.9}
          layers={2}
          opacity={0.9}
          className="absolute inset-0"
        />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_at_50%_30%,black,transparent_75%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_120%,#07080b_30%,transparent_70%)]" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-8 sm:px-10">
        {/* Brand */}
        <header className="flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-700">
          <img
            src="/logo-bpg.png"
            alt="Logo Barokah Perkasa Group"
            className="h-10 w-10 object-contain"
          />
          <div className="leading-tight">
            <p className="font-semibold tracking-tight">PO Bunker</p>
            <p className="text-xs text-white/55">Barokah Perkasa Group</p>
          </div>
        </header>

        <main className="grid flex-1 items-center gap-12 py-10 lg:grid-cols-[1.15fr_1fr] lg:gap-20">
          {/* Story */}
          <section className="space-y-9">
            <div className="space-y-5">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70 backdrop-blur animate-in fade-in duration-1000">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shadow-[0_0_8px_2px_rgba(251,191,36,0.6)]" />
                Purchase order bunker untuk armada
              </span>
              <BlurText
                text="Dari pengajuan PO sampai Delivery Order."
                animateBy="words"
                direction="bottom"
                delay={110}
                trigger="load"
                className="text-4xl font-semibold leading-[1.08] tracking-tight text-balance sm:text-5xl"
              />
              <p className="max-w-lg text-base leading-relaxed text-white/60 animate-in fade-in slide-in-from-bottom-2 duration-1000 delay-500 fill-mode-both">
                Catat setiap PO bunker kapal, pantau statusnya, dan tutup dengan
                kuantitas yang benar-benar dikirim.
              </p>
            </div>

            <ol className="hidden max-w-lg space-y-0 lg:block">
              {steps.map(({ icon: Icon, title, description }, index) => (
                <li
                  key={title}
                  className="flex gap-4 border-t border-white/10 py-4 animate-in fade-in slide-in-from-bottom-2 duration-700 fill-mode-both"
                  style={{ animationDelay: `${700 + index * 150}ms` }}
                >
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-400/10 text-amber-300 ring-1 ring-inset ring-amber-300/20">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-medium">{title}</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-white/50">
                      {description}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {/* Sign in */}
          <section className="mx-auto w-full max-w-md animate-in fade-in zoom-in-95 slide-in-from-bottom-4 duration-1000 delay-300 fill-mode-both lg:mx-0 lg:justify-self-end">
            <SpotlightCard
              spotlightColor="#fbbf24"
              intensity={0.18}
              spotlightSize={320}
              className="p-7 sm:p-9"
              style={
                {
                  "--spotlight-card-surface": "rgba(17, 18, 23, 0.72)",
                  backdropFilter: "blur(18px)",
                } as React.CSSProperties
              }
            >
              <div className="mb-7 space-y-1.5">
                <h1 className="text-2xl font-semibold tracking-tight">
                  Masuk ke PO Bunker
                </h1>
                <p className="text-sm text-white/55">
                  Gunakan akun yang didaftarkan oleh administrator.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                {errors.form && (
                  <div
                    role="alert"
                    className="flex items-start gap-2 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-200"
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{errors.form}</span>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="email" className="text-white/80">
                    Alamat email
                  </Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                    <Input
                      type="email"
                      id="email"
                      name="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      placeholder="nama@barokahperkasagroup.com"
                      disabled={isLoading}
                      autoComplete="email"
                      autoFocus
                      className={`${fieldClass} pl-10 ${errors.email ? "border-red-400/60" : ""}`}
                    />
                  </div>
                  {errors.email && (
                    <p className="flex items-center gap-1.5 text-sm text-red-300">
                      <AlertCircle className="h-3.5 w-3.5" />
                      {errors.email}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-white/80">
                    Kata sandi
                  </Label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                    <Input
                      type={showPassword ? "text" : "password"}
                      id="password"
                      name="password"
                      value={formData.password}
                      onChange={handleInputChange}
                      placeholder="Masukkan kata sandi"
                      disabled={isLoading}
                      autoComplete="current-password"
                      className={`${fieldClass} pl-10 pr-10 ${errors.password ? "border-red-400/60" : ""}`}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-11 px-3 text-white/45 hover:bg-transparent hover:text-white"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={
                        showPassword
                          ? "Sembunyikan kata sandi"
                          : "Tampilkan kata sandi"
                      }
                      disabled={isLoading}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  {errors.password && (
                    <p className="flex items-center gap-1.5 text-sm text-red-300">
                      <AlertCircle className="h-3.5 w-3.5" />
                      {errors.password}
                    </p>
                  )}
                </div>

                <Button
                  type="submit"
                  disabled={isLoading}
                  size="lg"
                  className="group h-11 w-full bg-gradient-to-r from-amber-400 to-orange-500 font-semibold text-black shadow-lg shadow-orange-500/20 transition-all hover:brightness-110 hover:shadow-orange-500/40"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Memeriksa akun...
                    </>
                  ) : (
                    <>
                      Masuk
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </>
                  )}
                </Button>
              </form>

              <p className="mt-7 text-center text-sm text-white/45">
                Lupa kata sandi atau belum punya akun? Hubungi administrator PO
                Bunker.
              </p>
            </SpotlightCard>
          </section>
        </main>

        <footer className="text-xs text-white/35">
          &copy; {new Date().getFullYear()} Barokah Perkasa Group. Hak cipta
          dilindungi.
        </footer>
      </div>
    </div>
  );
};

export default Login;
