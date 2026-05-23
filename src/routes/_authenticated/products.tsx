import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listProducts, createProduct, updateProduct, deleteProduct } from "@/lib/products.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/products")({ component: ProductsPage });

function ProductsPage() {
  const qc = useQueryClient();
  const fetchProducts = useServerFn(listProducts);
  const create = useServerFn(createProduct);
  const update = useServerFn(updateProduct);
  const remove = useServerFn(deleteProduct);

  const q = useQuery({ queryKey: ["products"], queryFn: () => fetchProducts() });
  const [editing, setEditing] = useState<any | null>(null);
  const [open, setOpen] = useState(false);

  function refresh() { qc.invalidateQueries({ queryKey: ["products"] }); }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = {
      name: String(fd.get("name") || "").trim(),
      price: Number(fd.get("price")),
      stock: Number(fd.get("stock")),
      reorder_level: Number(fd.get("reorder_level")),
    };
    try {
      if (editing) {
        await update({ data: { id: editing.id, ...payload } });
        toast.success("Product updated");
      } else {
        await create({ data: payload });
        toast.success("Product added");
      }
      setOpen(false); setEditing(null); refresh();
    } catch (err: any) {
      toast.error(err?.message || "Could not save");
    }
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this product?")) return;
    try {
      await remove({ data: { id } });
      toast.success("Deleted");
      refresh();
    } catch (err: any) { toast.error(err?.message || "Failed"); }
  }

  const products = q.data?.products ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Products</h1>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditing(null)}><Plus className="w-4 h-4 mr-1" />Add</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? "Edit product" : "Add product"}</DialogTitle></DialogHeader>
            <form onSubmit={onSubmit} className="space-y-3">
              <div className="space-y-2"><Label>Name</Label><Input name="name" defaultValue={editing?.name ?? ""} required /></div>
              <div className="space-y-2"><Label>Price (Ksh)</Label><Input name="price" type="number" min="1" step="0.01" defaultValue={editing?.price ?? ""} required /></div>
              <div className="space-y-2"><Label>Stock</Label><Input name="stock" type="number" min="0" defaultValue={editing?.stock ?? 0} required /></div>
              <div className="space-y-2"><Label>Reorder level</Label><Input name="reorder_level" type="number" min="1" defaultValue={editing?.reorder_level ?? 5} required /></div>
              <DialogFooter><Button type="submit">{editing ? "Save" : "Add"}</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {q.isLoading ? <p className="text-muted-foreground">Loading...</p> :
        products.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-muted-foreground">No products yet. Add your first product to start selling.</CardContent></Card>
        ) : (
          <div className="space-y-2">
            {products.map((p: any) => (
              <Card key={p.id}>
                <CardContent className="p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{p.name}</div>
                    <div className="text-sm text-muted-foreground">Ksh {Number(p.price).toLocaleString()} · {p.stock} in stock {p.stock <= p.reorder_level && <span className="text-warning">(low)</span>}</div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => { setEditing(p); setOpen(true); }}><Pencil className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => onDelete(p.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      }
    </div>
  );
}