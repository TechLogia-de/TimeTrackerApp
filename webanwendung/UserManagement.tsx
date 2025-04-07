import React, { useState, useEffect } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Badge } from "../ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { 
  MoreHorizontal, 
  Search, 
  UserPlus, 
  Mail, 
  Key, 
  User as UserIcon, 
  AlertCircle, 
  Download, 
  Filter, 
  CheckCircle, 
  XCircle, 
  FileText, 
  UserCog, 
  RefreshCw 
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { db, auth } from "../../lib/firebase";
import { 
  collection, 
  getDocs, 
  doc, 
  setDoc, 
  deleteDoc, 
  addDoc, 
  updateDoc, 
  query, 
  where, 
  serverTimestamp 
} from "firebase/firestore";
import { toast } from "../ui/use-toast";
import { UserRole } from "@/lib/hooks/useAuth";
import { 
  createUserWithEmailAndPassword, 
  signOut, 
  updateProfile,
  sendPasswordResetEmail,
  getAuth,
  EmailAuthProvider,
  updatePassword,
  reauthenticateWithCredential
} from "firebase/auth";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle, 
  AlertDialogTrigger 
} from "../ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { Skeleton } from "../ui/skeleton";
import { Progress } from "../ui/progress";

// Importiere die ausgelagerten Typen und Komponenten
import { User, UserFormData, UserEditData } from './types';
import UserCreationDialog from './dialogs/UserCreationDialog';
import UserEditDialog from './dialogs/UserEditDialog';
import ResetPasswordDialog from './dialogs/ResetPasswordDialog';
import DeleteUserDialog from './dialogs/DeleteUserDialog';

const UserManagement = ({ mode }: { mode?: 'list' | 'create' | 'edit' } = {}) => {
  const { t } = useTranslation();
  console.log("UserManagement wird gerendert", { mode }); // Debug

  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Dialog-Zustände
  const [isAddUserDialogOpen, setIsAddUserDialogOpen] = useState(mode === 'create');
  const [isEditUserDialogOpen, setIsEditUserDialogOpen] = useState(false);
  const [isResetPasswordDialogOpen, setIsResetPasswordDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  
  // State für Delete-Dialog
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  
  // State für Fortschrittsanzeige
  const [operationInProgress, setOperationInProgress] = useState(false);
  const [operationProgress, setOperationProgress] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState("");

  // Benutzer aus Firestore laden
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        setLoading(true);
        const usersCollection = collection(db, "users");
        const userSnapshot = await getDocs(usersCollection);
        const userList = userSnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            name: data.displayName || "Unbekannt",
            email: data.email || "",
            role: data.role || "employee",
            department: data.department || "IT",
            status: data.status || "active",
            lastActive: data.lastActive || "Nie",
            avatar: data.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${data.email}`,
            skills: data.skills || [],
            experience: data.experience || 0,
            preferences: data.preferences || [],
            position: data.position || "",
            bio: data.bio || "",
            phone: data.phone || "",
            languages: data.languages || [],
          } as User;
        });
        
        setUsers(userList);
        setError(null);
      } catch (err) {
        console.error("Fehler beim Laden der Benutzer:", err);
        setError("Fehler beim Laden der Benutzer");
        // Fallback zu Demo-Benutzern
        setUsers([
          {
            id: "1",
            name: "Max Mustermann",
            email: "max@example.com",
            role: "admin",
            department: "IT",
            status: "active",
            lastActive: "Heute, 10:23",
            avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=max123",
            skills: [],
            experience: 0,
            preferences: [],
            position: "",
            bio: "",
            phone: "",
            languages: [],
          },
          {
            id: "2",
            name: "Anna Schmidt",
            email: "anna@example.com",
            role: "manager",
            department: "Marketing",
            status: "active",
            lastActive: "Heute, 09:15",
            avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=anna123",
            skills: [],
            experience: 0,
            preferences: [],
            position: "",
            bio: "",
            phone: "",
            languages: [],
          },
        ]);
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, []);

  // Filter Benutzer basierend auf den Suchkriterien
  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      searchQuery === "" ||
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesRole = roleFilter === "all" || user.role === roleFilter;
    const matchesDepartment =
      departmentFilter === "all" || user.department === departmentFilter;
    const matchesStatus = statusFilter === "all" || user.status === statusFilter;

    return matchesSearch && matchesRole && matchesDepartment && matchesStatus;
  });

  // Exportieren der Benutzerliste als CSV
  const exportUsersAsCSV = () => {
    try {
      setOperationInProgress(true);
      setLoadingMessage(t("users.exportingData"));
      
      // Fortschrittsanzeige simulieren
      let progress = 0;
      const interval = setInterval(() => {
        progress += 5;
        setOperationProgress(Math.min(progress, 90));
        if (progress >= 90) clearInterval(interval);
      }, 100);
      
      // CSV-Header erstellen
      const headers = [
        "Name",
        "E-Mail",
        "Rolle",
        "Abteilung",
        "Status",
        "Letzte Aktivität"
      ].join(",");
      
      // CSV-Zeilen erstellen
      const csvRows = filteredUsers.map(user => {
        return [
          `"${user.name}"`,
          `"${user.email}"`,
          `"${translateRole(user.role)}"`,
          `"${user.department}"`,
          `"${user.status === 'active' ? t('users.active') : t('users.inactive')}"`,
          `"${user.lastActive}"`
        ].join(",");
      });
      
      // CSV-Inhalt zusammensetzen
      const csvContent = [headers, ...csvRows].join("\n");
      
      // Download-Link erstellen
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      
      // Link erstellen und klicken
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `benutzer_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      
      // Link wieder entfernen
      document.body.removeChild(link);
      
      // Fortschrittsanzeige abschließen
      setOperationProgress(100);
      setTimeout(() => {
        setOperationInProgress(false);
        setOperationProgress(0);
        
        toast({
          title: t("users.exportSuccess"),
          description: t("users.exportSuccessDescription", { count: filteredUsers.length }),
        });
      }, 500);
      
      clearInterval(interval);
    } catch (error) {
      console.error("Fehler beim Exportieren der Benutzerliste:", error);
      toast({
        title: t("users.exportError"),
        description: t("users.exportErrorDescription"),
        variant: "destructive",
      });
      setOperationInProgress(false);
      setOperationProgress(0);
    }
  };

  // Verbesserte Funktion zum Löschen eines Benutzers
  const openDeleteDialog = (user: User) => {
    setUserToDelete(user);
    setIsDeleteDialogOpen(true);
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    
    setOperationInProgress(true);
    setLoadingMessage(t("users.deletingUser"));
    
    try {
      // Fortschrittsanzeige simulieren
      let progress = 0;
      const interval = setInterval(() => {
        progress += 10;
        setOperationProgress(Math.min(progress, 90));
        if (progress >= 90) clearInterval(interval);
      }, 100);
      
      // Benutzer in Firestore löschen
      const userRef = doc(db, "users", userToDelete.id);
      await deleteDoc(userRef);
      
      // Benutzer aus der lokalen Liste entfernen
      setUsers(users.filter(user => user.id !== userToDelete.id));
      
      // Fortschrittsanzeige abschließen
      setOperationProgress(100);
      setTimeout(() => {
        setOperationInProgress(false);
        setOperationProgress(0);
        setIsDeleteDialogOpen(false);
        setUserToDelete(null);
        
        toast({
          title: t("users.userDeleted"),
          description: t("users.userDeletedDescription", { name: userToDelete.name }),
        });
      }, 500);
      
      clearInterval(interval);
    } catch (error) {
      console.error("Fehler beim Löschen des Benutzers:", error);
      toast({
        title: t("users.errorDeletingUser"),
        description: t("users.errorDeletingUserDescription"),
        variant: "destructive",
      });
      setOperationInProgress(false);
      setOperationProgress(0);
    }
  };

  // Optimierte Funktion zum Erstellen eines Benutzers, die den Admin nicht abmeldet
  const handleCreateUser = async (userData: UserFormData) => {
    try {
      setOperationInProgress(true);
      setLoadingMessage(t("users.creatingUser"));
      
      // Fortschrittsanzeige simulieren
      let progress = 0;
      const interval = setInterval(() => {
        progress += 5;
        setOperationProgress(Math.min(progress, 90));
        if (progress >= 90) clearInterval(interval);
      }, 100);
      
      // In einer echten Produktionsumgebung würde hier ein API-Aufruf an einen
      // Backend-Dienst oder eine Cloud Function erfolgen, die einen neuen Benutzer 
      // erstellt, ohne den aktuellen Admin abzumelden
      
      // Nur für Demo: Erstellen eines Mock-Benutzers mit simulierter UID
      const mockUserId = "user_" + Date.now();
      
      // Benutzer in Firestore speichern
      await setDoc(doc(db, "users", mockUserId), {
        uid: mockUserId,
        email: userData.email,
        displayName: userData.displayName,
        role: userData.role,
        department: userData.department,
        status: userData.status,
        skills: userData.skills,
        experience: userData.experience,
        position: userData.position,
        preferences: userData.preferences,
        createdAt: serverTimestamp(),
        lastActive: "Gerade eben",
        passwordResetRequired: true, // Benutzer muss Passwort bei erster Anmeldung ändern
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${userData.email}`,
      });
      
      // Neuen Benutzer zur Liste hinzufügen
      const newUser: User = {
        id: mockUserId,
        name: userData.displayName,
        email: userData.email,
        role: userData.role,
        department: userData.department,
        status: userData.status,
        lastActive: "Gerade eben",
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${userData.email}`,
        skills: userData.skills,
        experience: userData.experience,
        preferences: userData.preferences,
        position: userData.position,
      };
      
      setUsers([...users, newUser]);
      
      // Fortschrittsanzeige abschließen
      setOperationProgress(100);
      setTimeout(() => {
        setOperationInProgress(false);
        setOperationProgress(0);
        setIsAddUserDialogOpen(false);
        
        toast({
          title: t("users.userCreated"),
          description: t("users.userCreatedDescription", { name: userData.displayName }),
        });
      }, 500);
      
      clearInterval(interval);
      
      // Hinweis in der Konsole
      console.info(
        "HINWEIS: In einer Produktionsumgebung würde ein Backend-Endpunkt oder Firebase Admin SDK verwenden werden, " +
        "um einen echten Benutzer mit Firebase Authentication zu erstellen."
      );
    } catch (error: any) {
      console.error("Fehler beim Erstellen des Benutzers:", error);
      
      toast({
        title: t("users.errorCreatingUser"),
        description: error.message,
        variant: "destructive",
      });
      
      setOperationInProgress(false);
      setOperationProgress(0);
    }
  };

  // Benutzer bearbeiten
  const handleEditUser = (userId: string, userData: UserEditData) => {
    try {
      setLoading(true);
      
      // Referenz zum Benutzer-Dokument in Firestore
      const userRef = doc(db, "users", userId);
      
      // Aktualisiere die Benutzerdaten in Firestore
      updateDoc(userRef, {
        displayName: userData.displayName,
        role: userData.role,
        department: userData.department,
        status: userData.status,
        skills: userData.skills,
        experience: userData.experience,
        position: userData.position,
        preferences: userData.preferences,
        updatedAt: new Date()
      }).then(() => {
        // Aktualisiere die lokale Benutzerliste
        setUsers(users.map(user => {
          if (user.id === userId) {
            return {
              ...user,
              name: userData.displayName,
              role: userData.role,
              department: userData.department,
              status: userData.status,
              skills: userData.skills,
              experience: userData.experience,
              position: userData.position,
              preferences: userData.preferences
            };
          }
          return user;
        }));
        
        // Erfolgsmeldung anzeigen
        toast({
          title: t("users.userUpdated"),
          description: t("users.userUpdatedDescription"),
          duration: 3000
        });
      }).catch(error => {
        console.error("Fehler beim Aktualisieren des Benutzers:", error);
        throw error;
      });
    } catch (error: any) {
      console.error("Fehler beim Aktualisieren des Benutzers:", error);
      
      // Fehlermeldung anzeigen
      toast({
        title: t("users.errorUpdatingUser"),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setIsEditUserDialogOpen(false);
    }
  };

  // Passwort zurücksetzen
  const handleResetPassword = async (email: string, method: "email" | "direct", newPassword?: string) => {
    try {
      setLoading(true);
      
      if (method === "email") {
        // Die Firebase Auth Funktion zum Senden einer Passwort-Reset-Email
        await sendPasswordResetEmail(auth, email);
        
        // Erfolgsmeldung anzeigen
        toast({
          title: t("users.passwordResetLinkSent"),
          description: t("users.passwordResetLinkSentDesc"),
          duration: 5000
        });
      } else if (method === "direct" && newPassword) {
        // Direktes Zurücksetzen des Passworts
        
        // 1. Suche den Benutzer in der Firestore-Datenbank
        const usersCollection = collection(db, "users");
        const q = query(usersCollection, where("email", "==", email));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
          throw new Error("Benutzer nicht gefunden");
        }
        
        const userDoc = querySnapshot.docs[0];
        const userId = userDoc.id;
        
        // 2. Setze ein temporäres Passwort in der Firestore-Datenbank
        // Hinweis: In einer echten Anwendung würde dies über Admin SDK oder Cloud Functions geschehen
        await updateDoc(doc(db, "users", userId), {
          tempPassword: newPassword,
          passwordResetRequired: true,
          passwordResetTime: new Date()
        });
        
        // Erfolgnachricht anzeigen
        toast({
          title: t("users.passwordReset"),
          description: t("users.directPasswordResetDesc"),
          duration: 5000
        });
        
        // Sicherheitshinweis
        toast({
          title: "Sicherheitshinweis",
          description: "Diese Implementierung ist nur für Entwicklungszwecke gedacht. In einer Produktionsumgebung sollte ein sicherer Mechanismus verwendet werden.",
          variant: "destructive",
          duration: 8000
        });
      }
      
    } catch (error: any) {
      console.error("Fehler beim Zurücksetzen des Passworts:", error);
      
      // Fehlermeldung übersetzen und benutzerfreundlicher machen
      let errorMessage = error.message;
      
      if (error.code === "auth/user-not-found") {
        errorMessage = "Es wurde kein Benutzer mit dieser E-Mail-Adresse gefunden.";
      } else if (error.code === "auth/invalid-email") {
        errorMessage = "Die E-Mail-Adresse ist ungültig.";
      } else if (error.code === "auth/missing-android-pkg-name") {
        errorMessage = "Ein Android-Paketname muss angegeben werden, wenn die Android-App installiert werden soll.";
      } else if (error.code === "auth/missing-continue-uri") {
        errorMessage = "Es muss eine Weiterleitungs-URL angegeben werden.";
      } else if (error.code === "auth/missing-ios-bundle-id") {
        errorMessage = "Es muss eine iOS-Bundle-ID angegeben werden, wenn die iOS-App installiert werden soll.";
      } else if (error.code === "auth/invalid-continue-uri") {
        errorMessage = "Die Weiterleitungs-URL ist ungültig.";
      } else if (error.code === "auth/unauthorized-continue-uri") {
        errorMessage = "Die Weiterleitungs-URL befindet sich in einer nicht autorisierten Domain.";
      }
      
      // Fehlermeldung anzeigen
      toast({
        title: t("users.errorResettingPassword"),
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setIsResetPasswordDialogOpen(false);
    }
  };

  // Öffne den Dialog zum Bearbeiten eines Benutzers
  const openEditUserDialog = (user: User) => {
    setSelectedUser(user);
    setIsEditUserDialogOpen(true);
  };

  // Öffne den Dialog zum Zurücksetzen des Passworts
  const openResetPasswordDialog = (user: User) => {
    setSelectedUser(user);
    setIsResetPasswordDialogOpen(true);
  };

  // Übersetze die Rolle in einen lesbaren Begriff
  const translateRole = (role: string) => {
    switch (role) {
      case "admin":
        return t("users.admin");
      case "manager":
        return t("users.manager");
      case "employee":
        return t("users.employee");
      default:
        return role;
    }
  };

  // Status-Badge mit entsprechender Farbe
  const renderStatusBadge = (status: string) => {
    if (status === "active") {
      return <Badge className="bg-green-500">{t("users.active")}</Badge>;
    }
    return <Badge variant="outline">{t("users.inactive")}</Badge>;
  };

  // Sichere String-Extraktion für AvatarFallback
  const getInitials = (name: string): string => {
    try {
      return name ? name.substring(0, 2).toUpperCase() : "??";
    } catch (error) {
      return "??";
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">{t("users.userManagement")}</h1>
        <p className="text-muted-foreground">
          {t("users.manageUsersDescription")}
        </p>
      </div>

      {/* Fortschrittsanzeige für Operationen */}
      {operationInProgress && (
        <div className="mb-4 p-4 bg-background border rounded-md shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center">
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              <span className="font-medium">{loadingMessage}</span>
            </div>
            <span className="text-sm text-muted-foreground">{operationProgress}%</span>
          </div>
          <Progress value={operationProgress} className="h-2" />
        </div>
      )}

      {/* Filter- und Suchbereich */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{t("users.filterUsers")}</CardTitle>
              <CardDescription>
                {t("users.filterUsersDescription")}
              </CardDescription>
            </div>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="icon" 
                    onClick={exportUsersAsCSV}
                    disabled={operationInProgress || filteredUsers.length === 0}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t("users.exportCSV")}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="flex items-center space-x-2">
            <div className="relative w-full">
              <Search className="absolute left-2.5 top-2.5 text-muted-foreground h-4 w-4" />
              <Input
                placeholder={t("users.searchUsers")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
          <Select
            value={roleFilter}
            onValueChange={(value) => setRoleFilter(value)}
          >
            <SelectTrigger>
              <SelectValue placeholder={t("users.filterByRole")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("users.allRoles")}</SelectItem>
              <SelectItem value="admin">{t("users.admin")}</SelectItem>
              <SelectItem value="manager">{t("users.manager")}</SelectItem>
              <SelectItem value="employee">{t("users.employee")}</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={departmentFilter}
            onValueChange={(value) => setDepartmentFilter(value)}
          >
            <SelectTrigger>
              <SelectValue placeholder={t("users.filterByDepartment")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("users.allDepartments")}</SelectItem>
              <SelectItem value="IT">IT</SelectItem>
              <SelectItem value="Marketing">Marketing</SelectItem>
              <SelectItem value="Vertrieb">Vertrieb</SelectItem>
              <SelectItem value="Finanzen">Finanzen</SelectItem>
              <SelectItem value="Produktion">Produktion</SelectItem>
              <SelectItem value="Personal">Personal</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value)}
          >
            <SelectTrigger>
              <SelectValue placeholder={t("users.filterByStatus")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("users.allStatus")}</SelectItem>
              <SelectItem value="active">{t("users.active")}</SelectItem>
              <SelectItem value="inactive">{t("users.inactive")}</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button variant="outline" onClick={() => {
            setSearchQuery("");
            setRoleFilter("all");
            setDepartmentFilter("all");
            setStatusFilter("all");
          }}>
            <Filter className="h-4 w-4 mr-2" />
            {t("common.reset")}
          </Button>
          <Button onClick={() => setIsAddUserDialogOpen(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            {t("users.addUser")}
          </Button>
        </CardFooter>
      </Card>

      {/* Ergebniskarte mit Benutzertabelle */}
      <Card>
        <CardHeader>
          <CardTitle>{t("users.userList")}</CardTitle>
          <CardDescription>
            {t("users.totalUsers", { count: filteredUsers.length })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="flex items-center space-x-4">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-[200px]" />
                    <Skeleton className="h-4 w-[150px]" />
                  </div>
                </div>
              ))}
            </div>
          ) : error && users.length === 0 ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4 mr-2" />
              <AlertTitle>{t("common.error")}</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : filteredUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <UserCog className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">{t("users.noUsersFound")}</h3>
              <p className="text-muted-foreground mt-2 mb-4">
                {searchQuery || roleFilter !== "all" || departmentFilter !== "all" || statusFilter !== "all"
                  ? t("users.tryChangingFilters")
                  : t("users.noUsersYet")}
              </p>
              <Button onClick={() => setIsAddUserDialogOpen(true)}>
                <UserPlus className="h-4 w-4 mr-2" />
                {t("users.addNewUser")}
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("users.name")}</TableHead>
                    <TableHead>{t("users.email")}</TableHead>
                    <TableHead>{t("users.role")}</TableHead>
                    <TableHead>{t("users.department")}</TableHead>
                    <TableHead>{t("users.status")}</TableHead>
                    <TableHead>{t("users.lastActive")}</TableHead>
                    <TableHead className="text-right">{t("users.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center space-x-2">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={user.avatar} />
                            <AvatarFallback>
                              {getInitials(user.name)}
                            </AvatarFallback>
                          </Avatar>
                          <span>{user.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        {user.role === "admin" && (
                          <Badge variant="default" className="bg-purple-500">
                            {translateRole(user.role)}
                          </Badge>
                        )}
                        {user.role === "manager" && (
                          <Badge variant="default" className="bg-blue-500">
                            {translateRole(user.role)}
                          </Badge>
                        )}
                        {user.role === "employee" && (
                          <Badge variant="default" className="bg-gray-500">
                            {translateRole(user.role)}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{user.department}</TableCell>
                      <TableCell>
                        {user.status === "active" ? (
                          <div className="flex items-center">
                            <CheckCircle className="h-4 w-4 text-green-500 mr-1" />
                            <span>{t("users.active")}</span>
                          </div>
                        ) : (
                          <div className="flex items-center">
                            <XCircle className="h-4 w-4 text-gray-400 mr-1" />
                            <span>{t("users.inactive")}</span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>{user.lastActive}</TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0" disabled={operationInProgress}>
                              <span className="sr-only">{t("users.openMenu")}</span>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>{t("users.actions")}</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => openEditUserDialog(user)}>
                              <UserIcon className="h-4 w-4 mr-2" />
                              {t("users.edit")}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openResetPasswordDialog(user)}>
                              <Key className="h-4 w-4 mr-2" />
                              {t("users.resetPassword")}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              className="text-red-600"
                              onClick={() => openDeleteDialog(user)}
                            >
                              <XCircle className="h-4 w-4 mr-2" />
                              {t("users.delete")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialoge einbinden */}
      <UserCreationDialog
        isOpen={isAddUserDialogOpen}
        onClose={() => setIsAddUserDialogOpen(false)}
        onSave={handleCreateUser}
      />
      
      <UserEditDialog
        isOpen={isEditUserDialogOpen}
        onClose={() => setIsEditUserDialogOpen(false)}
        onSave={handleEditUser}
        userData={selectedUser}
      />

      <ResetPasswordDialog
        isOpen={isResetPasswordDialogOpen}
        onClose={() => setIsResetPasswordDialogOpen(false)}
        onReset={handleResetPassword}
        userEmail={selectedUser?.email || ""}
      />
      
      <DeleteUserDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={handleDeleteUser}
        userName={userToDelete?.name || ""}
      />
    </div>
  );
};

export default UserManagement; 