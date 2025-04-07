import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/use-toast";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/lib/hooks/useAuth";
import { CustomerService } from "@/lib/services/customerService";
import { Customer, CustomerFormData, ContactPerson } from "@/types/customer";
import { Trash2, Plus, Building, Mail, Phone, Globe, User, MapPin } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useTranslation } from "react-i18next";

// Schema für die Adresse
const addressSchema = z.object({
  street: z.string().min(1, "Straße ist erforderlich"),
  houseNumber: z.string().optional(),
  zipCode: z.string().min(1, "PLZ ist erforderlich"),
  city: z.string().min(1, "Stadt ist erforderlich"),
  country: z.string().min(1, "Land ist erforderlich"),
});

// Schema für die Kontaktperson
const contactPersonSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Name ist erforderlich"),
  position: z.string().optional(),
  email: z.string().email("Gültige E-Mail-Adresse erforderlich"),
  phone: z.string().optional(),
});

// Schema für das gesamte Kundenformular
const customerFormSchema = z.object({
  name: z.string().min(2, "Name muss mindestens 2 Zeichen lang sein"),
  customerNumber: z.string().min(1, "Kundennummer ist erforderlich"),
  vatId: z.string().optional(),
  address: addressSchema,
  contactPersons: z.array(contactPersonSchema),
  email: z.string().email("Gültige E-Mail-Adresse erforderlich"),
  phone: z.string().optional(),
  website: z.string().optional(),
  notes: z.string().optional(),
  isActive: z.boolean().default(true),
});

type CustomerFormProps = {
  initialData?: Customer;
  onSubmit: (data: CustomerFormData) => void;
  onCancel: () => void;
};

const CustomerForm: React.FC<CustomerFormProps> = ({
  initialData,
  onSubmit,
  onCancel,
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isEditing = !!initialData;

  // Form-Status
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [customerNumber, setCustomerNumber] = useState("");

  // Formular mit React Hook Form initialisieren
  const form = useForm<z.infer<typeof customerFormSchema>>({
    resolver: zodResolver(customerFormSchema),
    defaultValues: initialData
      ? {
          ...initialData,
          contactPersons: initialData.contactPersons || [],
        }
      : {
          name: "",
          customerNumber: "",
          vatId: "",
          address: {
            street: "",
            houseNumber: "",
            zipCode: "",
            city: "",
            country: "Deutschland", // Standardwert
          },
          contactPersons: [
            {
              id: crypto.randomUUID(),
              name: "",
              position: "",
              email: "",
              phone: "",
            },
          ],
          email: "",
          phone: "",
          website: "",
          notes: "",
          isActive: true,
        },
  });

  // Nächste verfügbare Kundennummer abrufen, wenn neuer Kunde
  useEffect(() => {
    if (!isEditing) {
      const getNextCustomerNumber = async () => {
        try {
          const number = await CustomerService.getNextCustomerNumber();
          setCustomerNumber(number);
          form.setValue("customerNumber", number);
        } catch (error) {
          console.error("Fehler beim Abrufen der nächsten Kundennummer:", error);
          // Fallback
          const fallbackNumber = "K-" + new Date().getTime();
          setCustomerNumber(fallbackNumber);
          form.setValue("customerNumber", fallbackNumber);
        }
      };

      getNextCustomerNumber();
    }
  }, [isEditing, form]);

  // Kontaktperson hinzufügen
  const addContactPerson = () => {
    const currentContactPersons = form.getValues("contactPersons") || [];
    form.setValue("contactPersons", [
      ...currentContactPersons,
      {
        id: crypto.randomUUID(),
        name: "",
        position: "",
        email: "",
        phone: "",
      },
    ]);
  };

  // Kontaktperson entfernen
  const removeContactPerson = (index: number) => {
    const currentContactPersons = form.getValues("contactPersons") || [];
    if (currentContactPersons.length > 1) {
      form.setValue(
        "contactPersons",
        currentContactPersons.filter((_, i) => i !== index)
      );
    } else {
      toast({
        title: "Hinweis",
        description: "Mindestens eine Kontaktperson ist erforderlich.",
        variant: "default",
      });
    }
  };

  // Formular absenden
  const handleSubmit = async (values: z.infer<typeof customerFormSchema>) => {
    setIsSubmitting(true);
    try {
      onSubmit(values as CustomerFormData);
    } catch (error) {
      console.error("Fehler beim Speichern des Kunden:", error);
      toast({
        title: "Fehler",
        description: "Der Kunde konnte nicht gespeichert werden.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Grundlegende Informationen */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium flex items-center">
              <Building className="h-5 w-5 mr-2 text-primary" />
              Unternehmensdaten
            </h3>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Firmenname*</FormLabel>
                  <FormControl>
                    <Input placeholder="Firma GmbH" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="customerNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Kundennummer*</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="K-00001"
                        {...field}
                        readOnly={!isEditing}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="vatId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>USt-IdNr.</FormLabel>
                    <FormControl>
                      <Input placeholder="DE123456789" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>E-Mail*</FormLabel>
                  <FormControl>
                    <div className="flex">
                      <Mail className="h-4 w-4 mr-2 mt-3 text-muted-foreground" />
                      <Input
                        type="email"
                        placeholder="kontakt@firma.de"
                        {...field}
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefon</FormLabel>
                    <FormControl>
                      <div className="flex">
                        <Phone className="h-4 w-4 mr-2 mt-3 text-muted-foreground" />
                        <Input placeholder="+49 123 456789" {...field} />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="website"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Website</FormLabel>
                    <FormControl>
                      <div className="flex">
                        <Globe className="h-4 w-4 mr-2 mt-3 text-muted-foreground" />
                        <Input placeholder="www.firma.de" {...field} />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notizen</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Interne Notizen..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Adresse */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium flex items-center">
              <MapPin className="h-5 w-5 mr-2 text-primary" />
              Adresse
            </h3>

            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                <FormField
                  control={form.control}
                  name="address.street"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Straße*</FormLabel>
                      <FormControl>
                        <Input placeholder="Musterstraße" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="address.houseNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hausnummer</FormLabel>
                    <FormControl>
                      <Input placeholder="123" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="address.zipCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>PLZ*</FormLabel>
                    <FormControl>
                      <Input placeholder="12345" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="col-span-2">
                <FormField
                  control={form.control}
                  name="address.city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Stadt*</FormLabel>
                      <FormControl>
                        <Input placeholder="Musterstadt" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <FormField
              control={form.control}
              name="address.country"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Land*</FormLabel>
                  <FormControl>
                    <Input placeholder="Deutschland" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <Separator />

        {/* Kontaktpersonen */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-medium flex items-center">
              <User className="h-5 w-5 mr-2 text-primary" />
              Kontaktpersonen
            </h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addContactPerson}
            >
              <Plus className="h-4 w-4 mr-2" /> Kontaktperson hinzufügen
            </Button>
          </div>

          {form.watch("contactPersons")?.map((contact, index) => (
            <Card key={contact.id || index} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex justify-between items-start mb-4">
                  <h4 className="text-md font-medium">
                    Kontaktperson {index + 1}
                  </h4>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeContactPerson(index)}
                    disabled={form.watch("contactPersons")?.length <= 1}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name={`contactPersons.${index}.name`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name*</FormLabel>
                        <FormControl>
                          <Input placeholder="Max Mustermann" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name={`contactPersons.${index}.position`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Position</FormLabel>
                        <FormControl>
                          <Input placeholder="Geschäftsführer" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name={`contactPersons.${index}.email`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>E-Mail*</FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            placeholder="max@firma.de"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name={`contactPersons.${index}.phone`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Telefon</FormLabel>
                        <FormControl>
                          <Input placeholder="+49 123 456789" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex justify-end gap-4 pt-4">
          <Button type="button" variant="outline" onClick={onCancel}>
            Abbrechen
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting
              ? "Wird gespeichert..."
              : isEditing
              ? "Kunde aktualisieren"
              : "Kunde anlegen"}
          </Button>
        </div>
      </form>
    </Form>
  );
};

export default CustomerForm; 