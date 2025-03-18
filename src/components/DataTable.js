import React, { useState } from 'react';

function DataTable({ data, table, onAdd }) {
    const [formData, setFormData] = useState({
        name: '',
        supplier: '',
        manufacturer: '',
        batch_number: '',
        date: ''
    });

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData({
            ...formData,
            [name]: value
        });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onAdd(formData);
        setFormData({
            name: '',
            supplier: '',
            manufacturer: '',
            batch_number: '',
            date: ''
        });
    };

    return (
        <div>
            <h2>{table === 'raw_materials' ? 'Raw Materials' : 'Finished Products'}</h2>
            <table>
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>{table === 'raw_materials' ? 'Supplier' : 'Manufacturer'}</th>
                        <th>Batch Number</th>
                        <th>Date</th>
                    </tr>
                </thead>
                <tbody>
                    {data.map((item) => (
                        <tr key={item.id}>
                            <td>{item.name}</td>
                            <td>{table === 'raw_materials' ? item.supplier : item.manufacturer}</td>
                            <td>{item.batch_number}</td>
                            <td>{new Date(item.date).toLocaleDateString()}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <form onSubmit={handleSubmit}>
                <input type="text" name="name" placeholder="Name" value={formData.name} onChange={handleChange} required />
                {table === 'raw_materials' ? (
                    <input type="text" name="supplier" placeholder="Supplier" value={formData.supplier} onChange={handleChange} required />
                ) : (
                    <input type="text" name="manufacturer" placeholder="Manufacturer" value={formData.manufacturer} onChange={handleChange} required />
                )}
                <input type="text" name="batch_number" placeholder="Batch Number" value={formData.batch_number} onChange={handleChange} required />
                <input type="date" name="date" value={formData.date} onChange={handleChange} required />
                <button type="submit">Add</button>
            </form>
        </div>
    );
}

export default DataTable;
