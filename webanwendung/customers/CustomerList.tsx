import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Plus,
  Search,
  MoreHorizontal,
  Edit,
  Trash2,
  Eye,
  RefreshCw,
  XCircle,
  Building,
  PlusCircle,
} from "lucide-react";
import { Customer } from "@/types/customer";
import { CustomerService } from "@/lib/services/customerService";
import { useAuth } from "@/lib/hooks/useAuth";
import { useToast } from "@/components/ui/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "react-i18next";

const CustomerList: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Zustandsvariablen
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Kunden aus der Datenbank laden
  useEffect(() => {
    loadCustomers();
  }, []);

  // Kunden laden
  const loadCustomers = async () => {
    try {
      setIsLoading(true);
      const data = await CustomerService.getAllCustomers();
      setCustomers(data);
      setFilteredCustomers(data);
    } catch (error) {
      console.error("Fehler beim Laden der Kunden:", error);
      toast({
        title: "Fehler",
        description: "Die Kunden konnten nicht geladen werden.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Kunden aktualisieren
  const refreshCustomers = async () => {
    try {
      setIsRefreshing(true);
      await loadCustomers();
      toast({
        title: "Aktualisiert",
        description: "Die Kundenliste wurde aktualisiert.",
      });
    } catch (error) {
      console.error("Fehler beim Aktualisieren der Kunden:", error);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Suche nach Kunden
  useEffect(() => {
    if (searchTerm.trim() === "") {
      setFilteredCustomers(customers);
    } else {
      const lowerCaseSearchTerm = searchTerm.toLowerCase();
      const filtered = customers.filter(
        (customer) =>
          customer.name.toLowerCase().includes(lowerCaseSearchTerm) ||
          customer.customerNumber.toLowerCase().includes(lowerCaseSearchTerm) ||
          customer.email.toLowerCase().includes(lowerCaseSearchTerm) ||
          (customer.vatId &&
            customer.vatId.toLowerCase().includes(lowerCaseSearchTerm))
      );
      setFilteredCustomers(filtered);
    }
  }, [searchTerm, customers]);

  // Neuen Kunden erstellen
  const handleCreateCustomer = () => {
    navigate("/customers/new");
  };

  // Kunden bearbeiten
  const handleEditCustomer = (id: string) => {
    navigate(`/customers/edit/${id}`);
  };

  // Kunden Details anzeigen
  const handleViewCustomer = (id: string) => {
    navigate(`/customers/${id}`);
  };

  // Kunden deaktivieren
  const handleDeactivateCustomer = async (id: string) => {
    try {
      await CustomerService.deactivateCustomer(id);
      
      // Kundenliste aktualisieren
      setCustomers(prevCustomers =>
        prevCustomers.map(customer =>
          customer.id === id ? { ...customer, isActive: false } : customer
        )
      );
      
      toast({
        title: "Kunde deaktiviert",
        description: "Der Kunde wurde erfolgreich deaktiviert.",
      });
    } catch (error) {
      console.error("Fehler beim Deaktivieren des Kunden:", error);
      toast({
        title: "Fehler",
        description: "Der Kunde konnte nicht deaktiviert werden.",
        variant: "destructive",
      });
    }
  };

  // Kunden aktivieren
  const handleActivateCustomer = async (id: string) => {
    try {
      await CustomerService.activateCustomer(id);
      
      // Kundenliste aktualisieren
      setCustomers(prevCustomers =>
        prevCustomers.map(customer =>
          customer.id === id ? { ...customer, isActive: true } : customer
        )
      );
      
      toast({
        title: "Kunde aktiviert",
        description: "Der Kunde wurde erfolgreich aktiviert.",
      });
    } catch (error) {
      console.error("Fehler beim Aktivieren des Kunden:", error);
      toast({
        title: "Fehler",
        description: "Der Kunde konnte nicht aktiviert werden.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Kundenverwaltung</h1>
        <Button
          className="flex items-center"
          onClick={() => navigate("/customers/new")}
        >
          <PlusCircle className="mr-2 h-4 w-4" />
          Neuen Kunden erstellen
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-center">
            <CardTitle className="text-xl">Kundenliste</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={refreshCustomers}
              disabled={isRefreshing}
            >
              <RefreshCw
                className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`}
              />
              Aktualisieren
            </Button>
          </div>
          <div className="flex w-full max-w-sm items-center space-x-2 mt-4">
            <div className="relative w-full">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Suche nach Kunden..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center space-x-4">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-[250px]" />
                    <Skeleton className="h-4 w-[200px]" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div className="text-center py-8">
              <Building className="h-12 w-12 mx-auto text-muted-foreground" />
              <h3 className="mt-4 text-lg font-medium">Keine Kunden gefunden</h3>
              <p className="text-muted-foreground mt-2">
                {searchTerm
                  ? "Es wurden keine Kunden gefunden, die Ihrer Suche entsprechen."
                  : "Es sind noch keine Kunden angelegt."}
              </p>
              {searchTerm && (
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => setSearchTerm("")}
                >
                  Suche zurücksetzen
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Kundennummer</TableHead>
                  <TableHead>E-Mail</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCustomers.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell className="font-medium">{customer.name}</TableCell>
                    <TableCell>{customer.customerNumber}</TableCell>
                    <TableCell>{customer.email}</TableCell>
                    <TableCell>
                      {customer.isActive ? (
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                          Aktiv
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-gray-100 text-gray-500 border-gray-200">
                          Inaktiv
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Menü öffnen</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleViewCustomer(customer.id)}>
                            <Eye className="h-4 w-4 mr-2" />
                            Details anzeigen
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleEditCustomer(customer.id)}>
                            <Edit className="h-4 w-4 mr-2" />
                            Bearbeiten
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {customer.isActive ? (
                            <DropdownMenuItem onClick={() => handleDeactivateCustomer(customer.id)}>
                              <XCircle className="h-4 w-4 mr-2 text-gray-500" />
                              Deaktivieren
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={() => handleActivateCustomer(customer.id)}>
                              <RefreshCw className="h-4 w-4 mr-2 text-green-500" />
                              Aktivieren
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CustomerList; 